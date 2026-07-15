//! The ACP session-configuration contract: reduce an agent's advertised
//! select and boolean options (or legacy session modes) into one bounded,
//! ordered snapshot, validate a requested change against the retained
//! options, and translate it to the protocol value the agent expects. See
//! docs/architecture/agent-system.md and docs/reference/zed-agent-system.md.

use super::*;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) enum AgentSessionConfigTransport {
    #[default]
    ConfigOptions,
    LegacyMode,
}

#[derive(Clone, Debug)]
pub(crate) struct AgentSessionConfiguration {
    pub(crate) options: Vec<AgentSessionConfigOptionInfo>,
    pub(crate) transport: AgentSessionConfigTransport,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentSessionConfigOptionInfo {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) description: Option<String>,
    pub(crate) category: Option<String>,
    #[serde(flatten)]
    pub(crate) kind: AgentSessionConfigKindInfo,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub(crate) enum AgentSessionConfigKindInfo {
    Select {
        current_value: String,
        groups: Vec<AgentSessionConfigGroupInfo>,
    },
    Boolean {
        current_value: bool,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentSessionConfigGroupInfo {
    pub(crate) id: Option<String>,
    pub(crate) name: Option<String>,
    pub(crate) options: Vec<AgentSessionConfigValueInfo>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentSessionConfigValueInfo {
    pub(crate) value: String,
    pub(crate) name: String,
    pub(crate) description: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum AgentSessionConfigValueInput {
    Select { value: String },
    Boolean { value: bool },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionConfigSnapshot {
    pub(crate) session_id: String,
    pub(crate) config_options: Vec<AgentSessionConfigOptionInfo>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentSessionConfigEvent {
    pub(crate) connection_id: String,
    pub(crate) session_id: String,
    pub(crate) config_options: Vec<AgentSessionConfigOptionInfo>,
}

pub(crate) fn bounded_session_config_identifier(value: &str) -> Option<String> {
    if value.is_empty()
        || value.chars().count() > MAX_SESSION_CONFIG_FIELD_CHARS
        || value.chars().any(char::is_control)
    {
        return None;
    }
    Some(value.to_string())
}

fn bounded_session_config_text(value: &str) -> Option<String> {
    let value = value
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .take(MAX_SESSION_CONFIG_FIELD_CHARS)
        .collect::<String>();
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

pub(crate) fn local_model_config_options(model: &str) -> Vec<AgentSessionConfigOptionInfo> {
    let Some(model_id) = bounded_session_config_identifier(model) else {
        return Vec::new();
    };
    vec![AgentSessionConfigOptionInfo {
        id: "model".to_string(),
        name: "Model".to_string(),
        description: Some("The model selected when this Studio Agent connected.".to_string()),
        category: Some("model".to_string()),
        kind: AgentSessionConfigKindInfo::Select {
            current_value: model_id.clone(),
            groups: vec![AgentSessionConfigGroupInfo {
                id: None,
                name: None,
                options: vec![AgentSessionConfigValueInfo {
                    value: model_id.clone(),
                    name: model_id,
                    description: Some(
                        "Reconnect from the agent catalog to choose another model.".to_string(),
                    ),
                }],
            }],
        },
    }]
}

pub(crate) fn reduced_session_configuration(
    options: Vec<SessionConfigOption>,
    modes: Option<SessionModeState>,
) -> AgentSessionConfiguration {
    let options = reduced_session_config_options(options);
    if !options.is_empty() {
        return AgentSessionConfiguration {
            options,
            transport: AgentSessionConfigTransport::ConfigOptions,
        };
    }
    let options = modes
        .and_then(reduced_legacy_session_mode)
        .into_iter()
        .collect::<Vec<_>>();
    let transport = if options.is_empty() {
        AgentSessionConfigTransport::ConfigOptions
    } else {
        AgentSessionConfigTransport::LegacyMode
    };
    AgentSessionConfiguration { options, transport }
}

fn reduced_legacy_session_mode(modes: SessionModeState) -> Option<AgentSessionConfigOptionInfo> {
    let current_value = bounded_session_config_identifier(&modes.current_mode_id.to_string())?;
    let mut seen = HashSet::new();
    let options = modes
        .available_modes
        .into_iter()
        .filter_map(|mode| {
            let value = bounded_session_config_identifier(&mode.id.to_string())?;
            if !seen.insert(value.clone()) {
                return None;
            }
            Some(AgentSessionConfigValueInfo {
                value,
                name: bounded_session_config_text(&mode.name)?,
                description: mode
                    .description
                    .as_deref()
                    .and_then(bounded_session_config_text),
            })
        })
        .take(MAX_SESSION_CONFIG_VALUES)
        .collect::<Vec<_>>();
    if !options.iter().any(|option| option.value == current_value) {
        return None;
    }
    Some(AgentSessionConfigOptionInfo {
        id: LEGACY_SESSION_MODE_CONFIG_ID.to_string(),
        name: "Mode".to_string(),
        description: Some("How this agent approaches the next turn.".to_string()),
        category: Some("mode".to_string()),
        kind: AgentSessionConfigKindInfo::Select {
            current_value,
            groups: vec![AgentSessionConfigGroupInfo {
                id: None,
                name: None,
                options,
            }],
        },
    })
}

pub(crate) fn replace_legacy_mode_current_value(
    configuration: &mut AgentSessionConfiguration,
    current_value: &str,
) -> bool {
    if configuration.transport != AgentSessionConfigTransport::LegacyMode {
        return false;
    }
    let Some(current_value) = bounded_session_config_identifier(current_value) else {
        return false;
    };
    let Some(option) = configuration
        .options
        .iter_mut()
        .find(|option| option.id == LEGACY_SESSION_MODE_CONFIG_ID)
    else {
        return false;
    };
    let AgentSessionConfigKindInfo::Select {
        current_value: confirmed,
        groups,
    } = &mut option.kind
    else {
        return false;
    };
    if !groups
        .iter()
        .flat_map(|group| group.options.iter())
        .any(|option| option.value == current_value)
    {
        return false;
    }
    *confirmed = current_value;
    true
}

pub(crate) fn reduced_session_config_options(
    options: Vec<SessionConfigOption>,
) -> Vec<AgentSessionConfigOptionInfo> {
    let mut seen = HashSet::new();
    options
        .into_iter()
        .filter_map(reduced_session_config_option)
        .filter(|option| seen.insert(option.id.clone()))
        .take(MAX_SESSION_CONFIG_OPTIONS)
        .collect()
}

fn reduced_session_config_option(
    option: SessionConfigOption,
) -> Option<AgentSessionConfigOptionInfo> {
    let id = bounded_session_config_identifier(&option.id.to_string())?;
    let name = bounded_session_config_text(&option.name)?;
    let description = option
        .description
        .as_deref()
        .and_then(bounded_session_config_text);
    let category = match option.category {
        Some(SessionConfigOptionCategory::Mode) => Some("mode".to_string()),
        Some(SessionConfigOptionCategory::Model) => Some("model".to_string()),
        Some(SessionConfigOptionCategory::ModelConfig) => Some("model-config".to_string()),
        Some(SessionConfigOptionCategory::ThoughtLevel) => Some("thought-level".to_string()),
        Some(SessionConfigOptionCategory::Other(category)) => {
            bounded_session_config_identifier(&category)
        }
        None => None,
        _ => None,
    };
    let kind = match option.kind {
        SessionConfigKind::Select(select) => {
            let current_value =
                bounded_session_config_identifier(&select.current_value.to_string())?;
            let groups = reduced_session_config_groups(select.options);
            let contains_current = groups.iter().any(|group| {
                group
                    .options
                    .iter()
                    .any(|option| option.value == current_value)
            });
            if groups.is_empty() || !contains_current {
                return None;
            }
            AgentSessionConfigKindInfo::Select {
                current_value,
                groups,
            }
        }
        SessionConfigKind::Boolean(boolean) => AgentSessionConfigKindInfo::Boolean {
            current_value: boolean.current_value,
        },
        _ => return None,
    };
    Some(AgentSessionConfigOptionInfo {
        id,
        name,
        description,
        category,
        kind,
    })
}

fn reduced_session_config_groups(
    options: SessionConfigSelectOptions,
) -> Vec<AgentSessionConfigGroupInfo> {
    let mut remaining = MAX_SESSION_CONFIG_VALUES;
    let mut seen_values = HashSet::new();
    match options {
        SessionConfigSelectOptions::Ungrouped(options) => {
            let values = reduced_session_config_values(options, &mut remaining, &mut seen_values);
            (!values.is_empty())
                .then_some(AgentSessionConfigGroupInfo {
                    id: None,
                    name: None,
                    options: values,
                })
                .into_iter()
                .collect()
        }
        SessionConfigSelectOptions::Grouped(groups) => groups
            .into_iter()
            .take(MAX_SESSION_CONFIG_GROUPS)
            .filter_map(|group| {
                if remaining == 0 {
                    return None;
                }
                let id = bounded_session_config_identifier(&group.group.to_string())?;
                let name = bounded_session_config_text(&group.name)?;
                let options =
                    reduced_session_config_values(group.options, &mut remaining, &mut seen_values);
                (!options.is_empty()).then_some(AgentSessionConfigGroupInfo {
                    id: Some(id),
                    name: Some(name),
                    options,
                })
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn reduced_session_config_values(
    options: Vec<agent_client_protocol::schema::v1::SessionConfigSelectOption>,
    remaining: &mut usize,
    seen: &mut HashSet<String>,
) -> Vec<AgentSessionConfigValueInfo> {
    let mut reduced = Vec::new();
    for option in options {
        if *remaining == 0 {
            break;
        }
        let Some(value) = bounded_session_config_identifier(&option.value.to_string()) else {
            continue;
        };
        if !seen.insert(value.clone()) {
            continue;
        }
        let Some(name) = bounded_session_config_text(&option.name) else {
            continue;
        };
        reduced.push(AgentSessionConfigValueInfo {
            value,
            name,
            description: option
                .description
                .as_deref()
                .and_then(bounded_session_config_text),
        });
        *remaining -= 1;
    }
    reduced
}

pub(crate) fn protocol_session_config_value(
    options: &[AgentSessionConfigOptionInfo],
    config_id: &str,
    value: AgentSessionConfigValueInput,
) -> Result<SessionConfigOptionValue, String> {
    let option = options
        .iter()
        .find(|option| option.id == config_id)
        .ok_or_else(|| "The agent did not advertise this session option.".to_string())?;
    match (&option.kind, value) {
        (
            AgentSessionConfigKindInfo::Select { groups, .. },
            AgentSessionConfigValueInput::Select { value },
        ) if groups
            .iter()
            .flat_map(|group| group.options.iter())
            .any(|option| option.value == value) =>
        {
            Ok(SessionConfigOptionValue::value_id(value))
        }
        (
            AgentSessionConfigKindInfo::Boolean { .. },
            AgentSessionConfigValueInput::Boolean { value },
        ) => Ok(SessionConfigOptionValue::boolean(value)),
        (
            AgentSessionConfigKindInfo::Select { .. },
            AgentSessionConfigValueInput::Select { .. },
        ) => Err("The agent did not advertise this value for the session option.".to_string()),
        _ => Err("The session option value has the wrong type.".to_string()),
    }
}
