//! One ordered way out of the agent host.
//!
//! Every agent event leaves through this bus, across six channels. Each one is
//! stamped with a monotonic sequence from a single counter, so the client can
//! order events that arrive on different channels and can name a gap instead
//! of guessing. A failed send is reported once, with the channel and the
//! sequence it lost, rather than swallowed: without that record the webview
//! cannot tell a quiet host from a broken one, and a test cannot tell "nothing
//! happened yet" from "the event was dropped".
//!
//! # Milestones
//!
//! The bus also owns the milestone channel. A milestone is the host stating
//! that an asynchronous thing has *finished*: a turn went quiet, an artifact
//! finished validating, the staged tree settled. It carries no payload beyond
//! identity and outcome, because its only job is to be waited on.
//!
//! This exists for tests, and that is not a small reason. Agent work is
//! asynchronous, and a suite that waits for it by sleeping passes on timing
//! rather than correctness: it goes green on a fast machine and red in CI for
//! reasons nobody can reproduce. A milestone turns "the turn is finished" into
//! a fact a test can await. See docs/architecture/agent-orchestration.md.

use serde::Serialize;
use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// Where a published envelope goes.
///
/// An indirection rather than a direct `AppHandle`, so the bus can be built in
/// a test without a webview. Without it, every call site that needs the bus
/// becomes untestable, which is how a counter like `active_turns` ends up
/// never incremented in tests and wrong in production.
type EmitSink = Arc<dyn Fn(&'static str, serde_json::Value) + Send + Sync>;

/// The channels the host publishes on. Naming them here rather than at each
/// call site is what makes "every agent event goes through the bus" checkable.
pub(crate) mod channel {
    pub const CONNECTION: &str = "agent-connection-state";
    pub const TURN: &str = "agent-turn-update";
    pub const PERMISSION: &str = "agent-permission-update";
    pub const STAGE: &str = "agent-stage-update";
    pub const SESSION_CONFIG: &str = "agent-session-config-update";
    pub const AVAILABLE_COMMANDS: &str = "agent-available-commands-update";
    pub const MILESTONE: &str = "agent-milestone";
}

/// What every agent event looks like on the wire.
///
/// The payload keeps its own shape under `data`, so a channel's contract is
/// unchanged; the envelope only adds what the client needs to order and audit
/// what it received.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentEventEnvelope<T> {
    /// Monotonic across every channel, from one counter, starting at 1.
    pub sequence: u64,
    /// The channel this was published on, repeated inside the envelope so a
    /// client that multiplexes channels keeps the origin with the payload.
    pub channel: &'static str,
    pub data: T,
}

/// An asynchronous milestone the host has reached.
///
/// Deliberately thin. A milestone says that something finished and how it
/// finished; anything richer belongs on the channel that owns that state, and
/// duplicating it here would create a second source of truth for the same fact.
// `rename_all` renames the variants; the fields inside them need
// `rename_all_fields`, which is easy to leave off and produces a payload that
// deserializes to undefined on the TypeScript side without any error.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub(crate) enum AgentMilestone {
    /// A turn stopped running, for any reason. The single most useful signal
    /// in the set: almost every agent assertion is really waiting for this.
    TurnQuiescent {
        connection_id: String,
        session_id: Option<String>,
        outcome: MilestoneOutcome,
    },
    /// An artifact finished its deterministic validation pass, whether or not
    /// the artifact turned out to be valid.
    ///
    /// Carries no connection or session, because validation is a bundle-scoped
    /// command: the webview knows which thread it asked for, and inventing an
    /// identity here would be a second, unreliable source for that fact.
    ArtifactValidated {
        /// False when validation ran and rejected the artifact. Not an error:
        /// the milestone is that the pass completed.
        accepted: bool,
    },
    /// The staged tree finished changing for a session.
    StageSettled {
        connection_id: String,
        session_id: Option<String>,
        file_count: usize,
    },
    /// No turn is running on any connection. The host-level drain signal: what
    /// a test waits for when it does not know which connection is still busy.
    HostQuiescent,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum MilestoneOutcome {
    Completed,
    Failed,
    Cancelled,
}

/// The single publication path out of the agent host.
pub(crate) struct AgentEventBus {
    emit: EmitSink,
    sequence: AtomicU64,
    /// Turns currently running, keyed by connection and turn.
    ///
    /// A set of identities rather than a counter, because the counter had to be
    /// incremented from the point a turn is accepted, deep inside the
    /// connection worker, and a bus that is only decremented reports the host
    /// as quiet after every single turn. Every turn event already passes
    /// through this bus carrying its own identity, so liveness is derived from
    /// the traffic instead of from a second call nobody can forget to make.
    active_turns: Mutex<HashSet<(String, String)>>,
}

impl AgentEventBus {
    /// The production bus: envelopes go to the webview.
    pub fn new(app: AppHandle) -> Arc<Self> {
        let emit: EmitSink = Arc::new(move |channel, envelope| {
            if let Err(error) = app.emit(channel, &envelope) {
                let sequence = envelope
                    .get("sequence")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or_default();
                eprintln!(
                    "[agent-events] dropped sequence {sequence} on {channel}: {error}. \
                     The webview will report a gap at this sequence."
                );
            }
        });
        Self::with_sink(emit)
    }

    fn with_sink(emit: EmitSink) -> Arc<Self> {
        Arc::new(Self {
            emit,
            sequence: AtomicU64::new(0),
            active_turns: Mutex::new(HashSet::new()),
        })
    }

    /// Stamp and send. A send failure is reported with the channel and the
    /// sequence number that was lost, which is what makes a gap on the client
    /// side explainable rather than mysterious.
    ///
    /// A payload that cannot serialize is reported and dropped rather than
    /// panicking the host: one malformed event should not take the connection
    /// down, and the client sees the gap.
    pub fn publish<T: Serialize>(&self, channel: &'static str, data: T) {
        let sequence = self.sequence.fetch_add(1, Ordering::SeqCst) + 1;
        let envelope = AgentEventEnvelope {
            sequence,
            channel,
            data,
        };
        match serde_json::to_value(&envelope) {
            Ok(value) => (self.emit)(channel, value),
            Err(error) => eprintln!(
                "[agent-events] sequence {sequence} on {channel} could not serialize: {error}"
            ),
        }
    }

    /// Publish a milestone.
    pub fn milestone(&self, milestone: AgentMilestone) {
        self.publish(channel::MILESTONE, milestone);
    }

    /// Publish a turn event, tracking the turn's liveness and publishing its
    /// milestones when it ends.
    ///
    /// The derivation lives here rather than at the places that build turn
    /// updates, because every turn event already passes through this one sink.
    /// A new terminal update kind added upstream only has to be classified
    /// once, in `TurnLifecycle`.
    pub fn publish_turn<T>(&self, event: T)
    where
        T: Serialize + TurnLifecycle,
    {
        let key = event.turn_key();
        let outcome = event.outcome();
        match outcome {
            None => {
                if let Ok(mut active) = self.active_turns.lock() {
                    active.insert(key.clone());
                }
                self.publish(channel::TURN, event);
            }
            Some(outcome) => {
                self.publish(channel::TURN, event);
                self.milestone(AgentMilestone::TurnQuiescent {
                    connection_id: key.0.clone(),
                    session_id: Some(key.1.clone()),
                    outcome,
                });
                let remaining = match self.active_turns.lock() {
                    Ok(mut active) => {
                        active.remove(&key);
                        active.len()
                    }
                    // A poisoned lock cannot prove the host is quiet, so it
                    // does not claim to be.
                    Err(_) => usize::MAX,
                };
                if remaining == 0 {
                    self.milestone(AgentMilestone::HostQuiescent);
                }
            }
        }
    }

    /// How many turns are running. Read by tests; the milestone is the
    /// contract for everyone else, so this is not part of the host's API.
    #[cfg(test)]
    pub fn active_turns(&self) -> usize {
        self.active_turns
            .lock()
            .map(|active| active.len())
            .unwrap_or_default()
    }

    /// The last sequence issued. Read by tests; a client learns the sequence
    /// from the envelopes themselves.
    #[cfg(test)]
    pub fn last_sequence(&self) -> u64 {
        self.sequence.load(Ordering::SeqCst)
    }
}

/// A turn event that can say whether it ended the turn.
///
/// Implemented on the protocol's turn event rather than matched on here, so
/// this module stays free of the protocol's types and the classification sits
/// next to the enum it classifies.
pub(crate) trait TurnLifecycle {
    /// Which turn this event belongs to: connection and turn id.
    fn turn_key(&self) -> (String, String);
    /// `Some(outcome)` when this event ends the turn, `None` mid-turn.
    fn outcome(&self) -> Option<MilestoneOutcome>;
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A bus that keeps what it published, so the assertions run against the
    /// real bus rather than against a re-implementation of its counters.
    fn recording_bus() -> (Arc<AgentEventBus>, Arc<Mutex<Vec<serde_json::Value>>>) {
        let published = Arc::new(Mutex::new(Vec::new()));
        let sink_published = Arc::clone(&published);
        let bus = AgentEventBus::with_sink(Arc::new(move |_channel, envelope| {
            sink_published.lock().expect("published").push(envelope);
        }));
        (bus, published)
    }

    #[derive(Serialize, Clone)]
    struct Payload {
        state: &'static str,
    }

    /// A turn event stand-in, so the terminal classification can be tested
    /// without building the protocol's full event.
    #[derive(Serialize, Clone)]
    struct FakeTurn {
        turn_id: &'static str,
        ended: Option<MilestoneOutcome>,
    }

    impl TurnLifecycle for FakeTurn {
        fn turn_key(&self) -> (String, String) {
            ("connection-1".to_string(), self.turn_id.to_string())
        }
        fn outcome(&self) -> Option<MilestoneOutcome> {
            self.ended
        }
    }

    fn kinds(published: &Arc<Mutex<Vec<serde_json::Value>>>) -> Vec<String> {
        published
            .lock()
            .expect("published")
            .iter()
            .filter_map(|event| event["data"]["kind"].as_str().map(str::to_string))
            .collect()
    }

    #[test]
    fn sequences_start_at_one_and_never_repeat() {
        let (bus, published) = recording_bus();
        for _ in 0..500 {
            bus.publish(channel::TURN, Payload { state: "running" });
        }
        let sequences: Vec<u64> = published
            .lock()
            .expect("published")
            .iter()
            .map(|event| event["sequence"].as_u64().expect("sequence"))
            .collect();
        assert_eq!(sequences.first(), Some(&1));
        assert_eq!(sequences.last(), Some(&500));
        let mut unique = sequences.clone();
        unique.dedup();
        assert_eq!(unique.len(), sequences.len(), "a sequence number repeated");
        assert_eq!(bus.last_sequence(), 500);
    }

    #[test]
    fn sequences_stay_unique_across_threads() {
        let (bus, published) = recording_bus();
        let mut handles = Vec::new();
        for _ in 0..8 {
            let bus = Arc::clone(&bus);
            handles.push(std::thread::spawn(move || {
                for _ in 0..250 {
                    bus.publish(channel::TURN, Payload { state: "running" });
                }
            }));
        }
        for handle in handles {
            handle.join().expect("thread");
        }
        let mut sequences: Vec<u64> = published
            .lock()
            .expect("published")
            .iter()
            .map(|event| event["sequence"].as_u64().expect("sequence"))
            .collect();
        let total = sequences.len();
        assert_eq!(total, 2000);
        sequences.sort_unstable();
        sequences.dedup();
        assert_eq!(
            sequences.len(),
            total,
            "concurrent publishers reused a sequence"
        );
        assert_eq!(sequences.last(), Some(&(total as u64)));
    }

    #[test]
    fn the_envelope_carries_sequence_channel_and_payload() {
        let (bus, published) = recording_bus();
        bus.publish(channel::TURN, Payload { state: "running" });
        let published = published.lock().expect("published");
        let event = published.first().expect("one event");
        assert_eq!(event["sequence"], 1);
        assert_eq!(event["channel"], "agent-turn-update");
        assert_eq!(event["data"]["state"], "running");
    }

    #[test]
    fn milestone_fields_are_camel_case_on_the_wire() {
        // `rename_all` alone renames the variants and leaves the fields snake
        // case, which reaches TypeScript as undefined with no error anywhere.
        let (bus, published) = recording_bus();
        bus.milestone(AgentMilestone::TurnQuiescent {
            connection_id: "connection-1".into(),
            session_id: Some("session-1".into()),
            outcome: MilestoneOutcome::Completed,
        });
        let published = published.lock().expect("published");
        let data = &published.first().expect("one event")["data"];
        assert_eq!(data["kind"], "turnQuiescent");
        assert_eq!(data["connectionId"], "connection-1");
        assert_eq!(data["sessionId"], "session-1");
        assert_eq!(data["outcome"], "completed");
    }

    #[test]
    fn a_non_terminal_turn_event_publishes_no_milestone() {
        let (bus, published) = recording_bus();
        bus.publish_turn(FakeTurn {
            turn_id: "turn-1",
            ended: None,
        });
        assert!(
            kinds(&published).is_empty(),
            "a mid-turn event signalled quiescence"
        );
        assert_eq!(bus.active_turns(), 1);
    }

    #[test]
    fn a_terminal_turn_event_publishes_the_turn_then_the_host_milestone() {
        let (bus, published) = recording_bus();
        bus.publish_turn(FakeTurn {
            turn_id: "turn-1",
            ended: None,
        });
        bus.publish_turn(FakeTurn {
            turn_id: "turn-1",
            ended: Some(MilestoneOutcome::Completed),
        });
        // Order matters: a client seeing host quiescence must already have seen
        // the turn milestone that caused it.
        assert_eq!(kinds(&published), vec!["turnQuiescent", "hostQuiescent"]);
        assert_eq!(bus.active_turns(), 0);
    }

    #[test]
    fn host_quiescence_waits_for_the_last_concurrent_turn() {
        let (bus, published) = recording_bus();
        bus.publish_turn(FakeTurn {
            turn_id: "turn-1",
            ended: None,
        });
        bus.publish_turn(FakeTurn {
            turn_id: "turn-2",
            ended: None,
        });
        bus.publish_turn(FakeTurn {
            turn_id: "turn-1",
            ended: Some(MilestoneOutcome::Completed),
        });
        assert_eq!(
            kinds(&published),
            vec!["turnQuiescent"],
            "host quiescence fired while a second turn was still running"
        );
        assert_eq!(bus.active_turns(), 1);

        bus.publish_turn(FakeTurn {
            turn_id: "turn-2",
            ended: Some(MilestoneOutcome::Failed),
        });
        assert_eq!(
            kinds(&published),
            vec!["turnQuiescent", "turnQuiescent", "hostQuiescent"]
        );
        assert_eq!(bus.active_turns(), 0);
    }

    #[test]
    fn a_repeated_terminal_event_keeps_the_host_quiet() {
        // Removing a key that is already gone is a no-op, so a duplicated
        // terminal event cannot leave the host permanently "busy".
        let (bus, published) = recording_bus();
        bus.publish_turn(FakeTurn {
            turn_id: "turn-1",
            ended: Some(MilestoneOutcome::Failed),
        });
        bus.publish_turn(FakeTurn {
            turn_id: "turn-1",
            ended: Some(MilestoneOutcome::Failed),
        });
        assert_eq!(bus.active_turns(), 0);
        assert_eq!(
            kinds(&published),
            vec![
                "turnQuiescent",
                "hostQuiescent",
                "turnQuiescent",
                "hostQuiescent"
            ]
        );
    }

    #[test]
    fn a_payload_that_cannot_serialize_is_reported_rather_than_panicking() {
        struct Unserializable;
        impl Serialize for Unserializable {
            fn serialize<S: serde::Serializer>(&self, _: S) -> Result<S::Ok, S::Error> {
                Err(serde::ser::Error::custom("nope"))
            }
        }
        let (bus, published) = recording_bus();
        bus.publish(channel::TURN, Unserializable);
        assert!(published.lock().expect("published").is_empty());
        // The sequence was still consumed, so the client sees a gap rather than
        // silently receiving a renumbered stream.
        assert_eq!(bus.last_sequence(), 1);
    }
}
