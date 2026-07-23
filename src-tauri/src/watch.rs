//! Read-only filesystem watching for live reload.
//!
//! `start_watch` spins up a [`notify`] recursive watcher on the chosen folder
//! and a background debounce thread. Raw filesystem events are funnelled over a
//! channel; the thread coalesces bursts (a bulk edit, a `git checkout`) into a
//! single `bundle-changed` event emitted to the frontend after a short period of
//! quiet. The watcher only observes — it never writes — keeping the read-only,
//! scoped security posture.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::Duration;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Quiet period after the last raw event before a coalesced `bundle-changed`
/// is emitted.
const DEBOUNCE: Duration = Duration::from_millis(200);

/// Payload for the `bundle-changed` event. `root` is the watched folder; the
/// frontend re-reads the whole bundle on any change, so `concept_ids` may be
/// empty.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BundleChanged {
    root: String,
    concept_ids: Vec<String>,
}

/// A live watch: the `notify` watcher (kept alive so it keeps observing) plus
/// the sender used to tell the debounce thread to shut down.
struct ActiveWatch {
    _watcher: RecommendedWatcher,
    shutdown: Sender<()>,
}

/// Managed Tauri state holding the currently active watch, if any.
#[derive(Default)]
pub struct WatchState(Mutex<Option<ActiveWatch>>);

/// Whether an event's paths are relevant enough to trigger a reload. We keep
/// changes to `.md` files (and structural changes like directory create/remove,
/// where the path may have no extension) and drop pure noise inside ignored
/// dirs.
fn is_relevant(root: &Path, paths: &[PathBuf]) -> bool {
    let ignore = okf_core::ignore::IgnoreMatcher::load(root);
    paths.iter().any(|p| {
        let is_directory = p.is_dir();
        if p.file_name().and_then(|name| name.to_str()) != Some(".okfignore")
            && ignore.is_ignored(p, is_directory)
        {
            return false;
        }
        match p.extension().and_then(|e| e.to_str()) {
            // Markdown changes always matter.
            Some("md") => true,
            // No extension: likely a directory add/remove (structural change).
            None => true,
            // Other files (assets, lockfiles, editor temp files) are noise.
            Some(_) => false,
        }
    })
}

/// Begin watching `folder` recursively. Replaces any previous active watch.
/// Never panics on watcher errors — it logs and leaves the previous (now
/// stopped) state cleared.
pub fn start(app: AppHandle, state: &WatchState, folder: String) {
    // Tear down any existing watch first so a new watch always replaces it.
    stop(state);

    let root = PathBuf::from(&folder);

    // Channel carrying raw notify results into the debounce thread.
    let (event_tx, event_rx) = mpsc::channel::<notify::Result<Event>>();
    // Channel used to signal the debounce thread to exit.
    let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();

    let mut watcher = match RecommendedWatcher::new(
        move |res| {
            // The watcher callback must not panic; a closed receiver just means
            // the debounce thread has gone away, so we drop the event.
            let _ = event_tx.send(res);
        },
        notify::Config::default(),
    ) {
        Ok(w) => w,
        Err(err) => {
            eprintln!("[watch] failed to create watcher: {err}");
            return;
        }
    };

    if let Err(err) = watcher.watch(&root, RecursiveMode::Recursive) {
        eprintln!("[watch] failed to watch {}: {err}", root.display());
        return;
    }

    // Debounce thread: collect raw events and emit once things go quiet.
    std::thread::spawn(move || {
        debounce_loop(app, folder, event_rx, shutdown_rx);
    });

    let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    *guard = Some(ActiveWatch {
        _watcher: watcher,
        shutdown: shutdown_tx,
    });
}

/// Stop the active watch, if any. Dropping the watcher stops observation; the
/// shutdown signal lets the debounce thread exit cleanly.
pub fn stop(state: &WatchState) {
    let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(active) = guard.take() {
        // Best-effort: if the thread already exited, the send simply fails.
        let _ = active.shutdown.send(());
        // `active` (and thus the watcher) drops here, stopping observation.
    }
}

/// Receives raw events and emits a single coalesced `bundle-changed` after
/// `DEBOUNCE` of quiet following a relevant change.
fn debounce_loop(
    app: AppHandle,
    folder: String,
    event_rx: mpsc::Receiver<notify::Result<Event>>,
    shutdown_rx: mpsc::Receiver<()>,
) {
    let root = PathBuf::from(&folder);
    loop {
        // Block until the first event (or shutdown / disconnect).
        let mut pending = match event_rx.recv() {
            Ok(res) => consume(&root, res),
            // Sender dropped (watch stopped) — exit the thread.
            Err(_) => return,
        };

        // Drain the burst: keep extending the quiet window while events arrive.
        loop {
            // Bail out promptly if asked to shut down.
            if shutdown_rx.try_recv().is_ok() {
                return;
            }
            match event_rx.recv_timeout(DEBOUNCE) {
                Ok(res) => pending |= consume(&root, res),
                Err(RecvTimeoutError::Timeout) => break,
                // Sender dropped mid-burst — emit what we have, then exit below.
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }

        if pending {
            emit(&app, &folder);
        }
        // Loop back to `recv()`, which exits the thread if the sender has been
        // dropped (watch stopped).
    }
}

/// Maps a single raw notify result to whether it should count toward an emit.
fn consume(root: &Path, res: notify::Result<Event>) -> bool {
    match res {
        Ok(event) => is_relevant(root, &event.paths),
        Err(err) => {
            eprintln!("[watch] notify error: {err}");
            false
        }
    }
}

/// Emit the `bundle-changed` event, logging (never panicking) on failure.
fn emit(app: &AppHandle, folder: &str) {
    let payload = BundleChanged {
        root: folder.to_string(),
        concept_ids: Vec::new(),
    };
    if let Err(err) = app.emit("bundle-changed", payload) {
        eprintln!("[watch] failed to emit bundle-changed: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn watcher_uses_root_rules_and_observes_rule_changes() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("okf-watch-ignore-{nonce}"));
        fs::create_dir_all(root.join("private")).expect("private directory");
        fs::write(root.join(".okfignore"), "private/**\n!private/public.md\n")
            .expect("ignore rules");

        assert!(!is_relevant(
            &root,
            &[root.join("private").join("secret.md")]
        ));
        assert!(is_relevant(
            &root,
            &[root.join("private").join("public.md")]
        ));
        assert!(is_relevant(&root, &[root.join(".okfignore")]));

        fs::remove_dir_all(root).expect("cleanup");
    }
}
