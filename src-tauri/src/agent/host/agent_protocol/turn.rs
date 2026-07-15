//! Reducing ACP turn notifications to bounded, webview-safe events. Streams
//! agent text, plans, tool calls, usage, and stop reasons through fixed
//! caps, drops raw arguments and output, and reduces tool locations to
//! bundle-relative paths. See docs/architecture/agent-system.md.

use super::*;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnInfo {
    pub(crate) connection_id: String,
    pub(crate) session_id: String,
    pub(crate) turn_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentTurnEvent {
    pub(crate) connection_id: String,
    pub(crate) session_id: String,
    pub(crate) turn_id: String,
    pub(crate) update: AgentTurnUpdate,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub(crate) enum AgentTurnUpdate {
    Text {
        text: String,
        message_id: Option<String>,
    },
    Plan {
        entries: Vec<AgentPlanEntryInfo>,
    },
    ToolCall {
        tool_call_id: String,
        title: Option<String>,
        tool_kind: Option<&'static str>,
        status: Option<&'static str>,
        locations: Option<Vec<AgentToolLocationInfo>>,
        change_state: Option<&'static str>,
    },
    Usage {
        used_tokens: u64,
        context_window_tokens: u64,
        cost: Option<AgentUsageCostInfo>,
    },
    Completed {
        stop_reason: String,
    },
    Failed {
        message: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentPlanEntryInfo {
    pub(crate) content: String,
    pub(crate) priority: &'static str,
    pub(crate) status: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentUsageCostInfo {
    pub(crate) amount: f64,
    pub(crate) currency: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentToolLocationInfo {
    pub(crate) path: String,
    pub(crate) line: Option<u32>,
}

pub(crate) type TurnEventSink = Arc<dyn Fn(AgentTurnEvent) + Send + Sync>;

pub(crate) fn remove_active_turn(
    active_turns: &Mutex<HashMap<String, String>>,
    session_id: &str,
    turn_id: &str,
) {
    if let Ok(mut turns) = active_turns.lock() {
        if turns
            .get(session_id)
            .is_some_and(|active_turn| active_turn == turn_id)
        {
            turns.remove(session_id);
        }
    }
}

pub(crate) fn turn_event(
    connection_id: &str,
    active_turns: &Mutex<HashMap<String, String>>,
    sessions: &Mutex<HashMap<String, PathBuf>>,
    notification: SessionNotification,
) -> Option<AgentTurnEvent> {
    turn_event_with_change_state(connection_id, active_turns, sessions, notification, None)
}

pub(crate) fn turn_event_with_change_state(
    connection_id: &str,
    active_turns: &Mutex<HashMap<String, String>>,
    sessions: &Mutex<HashMap<String, PathBuf>>,
    notification: SessionNotification,
    change_state: Option<&'static str>,
) -> Option<AgentTurnEvent> {
    let session_id = notification.session_id.to_string();
    let turn_id = active_turns.lock().ok()?.get(&session_id)?.clone();
    let update = match notification.update {
        SessionUpdate::AgentMessageChunk(ContentChunk {
            content: ContentBlock::Text(text),
            message_id,
            ..
        }) => AgentTurnUpdate::Text {
            text: bounded_turn_text(&text.text),
            message_id: message_id.map(|id| id.to_string()),
        },
        SessionUpdate::Plan(plan) => AgentTurnUpdate::Plan {
            entries: plan
                .entries
                .into_iter()
                .take(MAX_PLAN_ENTRIES)
                .map(|entry| AgentPlanEntryInfo {
                    content: bounded_plan_entry(&entry.content),
                    priority: plan_priority_name(entry.priority),
                    status: plan_status_name(entry.status),
                })
                .collect(),
        },
        SessionUpdate::ToolCall(tool) => AgentTurnUpdate::ToolCall {
            tool_call_id: bounded_tool_field(&tool.tool_call_id.to_string()),
            title: Some(bounded_tool_field(&tool.title)),
            tool_kind: Some(tool_kind_name(tool.kind)),
            status: Some(tool_status_name(tool.status)),
            locations: Some(reduced_tool_locations(
                sessions,
                &session_id,
                tool.locations,
            )),
            change_state,
        },
        SessionUpdate::ToolCallUpdate(update) => AgentTurnUpdate::ToolCall {
            tool_call_id: bounded_tool_field(&update.tool_call_id.to_string()),
            title: update.fields.title.map(|title| bounded_tool_field(&title)),
            tool_kind: update.fields.kind.map(tool_kind_name),
            status: update.fields.status.map(tool_status_name),
            locations: update
                .fields
                .locations
                .map(|locations| reduced_tool_locations(sessions, &session_id, locations)),
            change_state,
        },
        SessionUpdate::UsageUpdate(usage) => reduced_usage_update(usage),
        _ => return None,
    };
    Some(AgentTurnEvent {
        connection_id: connection_id.to_string(),
        session_id,
        turn_id,
        update,
    })
}

pub(crate) fn reported_diffs(notification: &SessionNotification) -> Option<Vec<AgentReportedDiff>> {
    let content = match &notification.update {
        SessionUpdate::ToolCall(tool) => Some(&tool.content),
        SessionUpdate::ToolCallUpdate(update) => update.fields.content.as_ref(),
        _ => None,
    }?;
    let diffs = content
        .iter()
        .filter_map(|content| match content {
            ToolCallContent::Diff(diff) => Some(AgentReportedDiff {
                path: diff.path.clone(),
                old_text: diff.old_text.clone(),
                new_text: diff.new_text.clone(),
            }),
            _ => None,
        })
        .take(MAX_STAGED_FILES + 1)
        .collect::<Vec<_>>();
    (!diffs.is_empty()).then_some(diffs)
}

pub(crate) fn reduced_tool_locations(
    sessions: &Mutex<HashMap<String, PathBuf>>,
    session_id: &str,
    locations: Vec<ToolCallLocation>,
) -> Vec<AgentToolLocationInfo> {
    let Some(bundle_root) = sessions
        .lock()
        .ok()
        .and_then(|sessions| sessions.get(session_id).cloned())
    else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    locations
        .into_iter()
        .filter_map(|location| reduced_tool_location(&bundle_root, location))
        .filter(|location| seen.insert((location.path.clone(), location.line)))
        .take(MAX_TOOL_LOCATIONS)
        .collect()
}

pub(crate) fn reduced_tool_location(
    bundle_root: &std::path::Path,
    location: ToolCallLocation,
) -> Option<AgentToolLocationInfo> {
    if !location.path.is_absolute() {
        return None;
    }
    let relative = location.path.strip_prefix(bundle_root).ok()?;
    let mut parts = Vec::new();
    for component in relative.components() {
        let std::path::Component::Normal(part) = component else {
            return None;
        };
        let part = part.to_str()?;
        if part.is_empty() || part.chars().any(char::is_control) {
            return None;
        }
        parts.push(part);
    }
    if parts.is_empty() {
        return None;
    }
    let path = parts.join("/");
    if path.chars().count() > MAX_TOOL_PATH_CHARS {
        return None;
    }
    Some(AgentToolLocationInfo {
        path,
        line: location.line.filter(|line| *line > 0),
    })
}

pub(crate) fn reduced_usage_update(usage: UsageUpdate) -> AgentTurnUpdate {
    let cost = usage.cost.and_then(|cost| {
        let currency = cost.currency.trim();
        (cost.amount.is_finite()
            && cost.amount >= 0.0
            && cost.amount <= MAX_USAGE_COST
            && currency.len() == 3
            && currency.bytes().all(|byte| byte.is_ascii_alphabetic()))
        .then(|| AgentUsageCostInfo {
            amount: cost.amount,
            currency: currency.to_ascii_uppercase(),
        })
    });
    AgentTurnUpdate::Usage {
        used_tokens: usage.used.min(MAX_SAFE_USAGE_TOKENS),
        context_window_tokens: usage.size.min(MAX_SAFE_USAGE_TOKENS),
        cost,
    }
}

pub(crate) fn bounded_turn_text(text: &str) -> String {
    text.chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .take(MAX_TURN_CHUNK_CHARS)
        .collect()
}

pub(crate) fn bounded_plan_entry(content: &str) -> String {
    content
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .take(MAX_PLAN_ENTRY_CHARS)
        .collect()
}

pub(crate) fn plan_priority_name(priority: PlanEntryPriority) -> &'static str {
    match priority {
        PlanEntryPriority::High => "high",
        PlanEntryPriority::Medium => "medium",
        PlanEntryPriority::Low => "low",
        _ => "unknown",
    }
}

pub(crate) fn plan_status_name(status: PlanEntryStatus) -> &'static str {
    match status {
        PlanEntryStatus::Pending => "pending",
        PlanEntryStatus::InProgress => "in-progress",
        PlanEntryStatus::Completed => "completed",
        _ => "unknown",
    }
}

pub(crate) fn bounded_tool_field(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_control())
        .take(MAX_TOOL_FIELD_CHARS)
        .collect()
}

pub(crate) fn tool_kind_name(kind: ToolKind) -> &'static str {
    match kind {
        ToolKind::Read => "read",
        ToolKind::Edit => "edit",
        ToolKind::Delete => "delete",
        ToolKind::Move => "move",
        ToolKind::Search => "search",
        ToolKind::Execute => "execute",
        ToolKind::Think => "think",
        ToolKind::Fetch => "fetch",
        ToolKind::SwitchMode => "switch-mode",
        ToolKind::Other => "other",
        _ => "unknown",
    }
}

pub(crate) fn tool_status_name(status: ToolCallStatus) -> &'static str {
    match status {
        ToolCallStatus::Pending => "pending",
        ToolCallStatus::InProgress => "in-progress",
        ToolCallStatus::Completed => "completed",
        ToolCallStatus::Failed => "failed",
        _ => "unknown",
    }
}

pub(crate) fn stop_reason_name(reason: StopReason) -> &'static str {
    match reason {
        StopReason::EndTurn => "end-turn",
        StopReason::MaxTokens => "max-tokens",
        StopReason::MaxTurnRequests => "max-turn-requests",
        StopReason::Refusal => "refusal",
        StopReason::Cancelled => "cancelled",
        _ => "unknown",
    }
}
