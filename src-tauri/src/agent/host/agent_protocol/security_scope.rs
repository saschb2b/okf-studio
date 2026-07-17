//! The Rust-produced security scope surfaced to the webview for each
//! connection. It names effective mounts, writable roots, network and
//! credential policy, process containment, lifetime, and stop conditions:
//! the shipped boundaries, never a promise the host cannot keep. Studio
//! Agent reports a mediated in-process profile; external ACP agents report
//! their launcher-attached process owner and the interactive or restricted
//! platform profile. See docs/architecture/agent-system.md.

use serde::Serialize;

use crate::agent_process;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentSecurityScopeInfo {
    evidence_source: AgentSecurityEvidenceSource,
    process_containment: AgentProcessContainment,
    profile: AgentSecurityProfileInfo,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentSecurityProfileInfo {
    id: AgentSecurityProfileId,
    effective_mounts: AgentEffectiveMounts,
    writable_roots: AgentWritableRoots,
    network_policy: AgentNetworkPolicy,
    credential_exposure: AgentCredentialExposure,
    lifetime: AgentSecurityLifetime,
    stop_conditions: Vec<AgentSecurityStopCondition>,
    unattended_eligible: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
enum AgentSecurityProfileId {
    StudioNativeMediatedV1,
    ExternalInteractiveUnrestrictedV1,
    ExternalLinuxRestrictedOfflineV1,
    #[cfg(target_os = "windows")]
    ExternalWindowsRestrictedAppContainerV1,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AgentSecurityEvidenceSource {
    NativeProviderHost,
    ExternalProcessLauncher,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
enum AgentEffectiveMounts {
    StudioToolMediatedBundle,
    HostOperatingSystem,
    SystemRuntimeAgentAndReadOnlyBundle,
    #[cfg(target_os = "windows")]
    AppContainerRuntimeAndMediatedBundle,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
enum AgentWritableRoots {
    ReviewedStagingOnly,
    HostOperatingSystemPermissions,
    PrivateTemporaryOnly,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
enum AgentNetworkPolicy {
    ConfiguredEndpointOnly,
    HostOperatingSystem,
    Isolated,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
enum AgentCredentialExposure {
    ConfiguredEndpointOnly,
    HostOperatingSystemAndLaunchEnvironment,
    LaunchEnvironmentOnly,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AgentSecurityLifetime {
    Connection,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AgentSecurityStopCondition {
    Disconnect,
    ApplicationExit,
    HostFailure,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AgentProcessContainment {
    InProcess,
    #[cfg(unix)]
    PosixProcessGroup,
    #[cfg(windows)]
    WindowsJobObject,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ExternalProcessLaunchProfile {
    Standard,
    #[cfg(any(target_os = "linux", test))]
    LinuxRestrictedOffline,
    #[cfg(target_os = "windows")]
    WindowsRestrictedAppContainer,
}

impl AgentSecurityScopeInfo {
    pub(crate) fn native_provider() -> Self {
        Self {
            evidence_source: AgentSecurityEvidenceSource::NativeProviderHost,
            process_containment: AgentProcessContainment::InProcess,
            profile: AgentSecurityProfileInfo {
                id: AgentSecurityProfileId::StudioNativeMediatedV1,
                effective_mounts: AgentEffectiveMounts::StudioToolMediatedBundle,
                writable_roots: AgentWritableRoots::ReviewedStagingOnly,
                network_policy: AgentNetworkPolicy::ConfiguredEndpointOnly,
                credential_exposure: AgentCredentialExposure::ConfiguredEndpointOnly,
                lifetime: AgentSecurityLifetime::Connection,
                stop_conditions: vec![
                    AgentSecurityStopCondition::Disconnect,
                    AgentSecurityStopCondition::ApplicationExit,
                    AgentSecurityStopCondition::HostFailure,
                ],
                unattended_eligible: false,
            },
        }
    }

    pub(crate) fn external_process(
        containment: agent_process::AgentProcessContainment,
        launch_profile: ExternalProcessLaunchProfile,
    ) -> Self {
        let process_containment = match containment {
            #[cfg(unix)]
            agent_process::AgentProcessContainment::PosixProcessGroup => {
                AgentProcessContainment::PosixProcessGroup
            }
            #[cfg(windows)]
            agent_process::AgentProcessContainment::WindowsJobObject => {
                AgentProcessContainment::WindowsJobObject
            }
        };
        let profile = match launch_profile {
            ExternalProcessLaunchProfile::Standard => AgentSecurityProfileInfo {
                id: AgentSecurityProfileId::ExternalInteractiveUnrestrictedV1,
                effective_mounts: AgentEffectiveMounts::HostOperatingSystem,
                writable_roots: AgentWritableRoots::HostOperatingSystemPermissions,
                network_policy: AgentNetworkPolicy::HostOperatingSystem,
                credential_exposure:
                    AgentCredentialExposure::HostOperatingSystemAndLaunchEnvironment,
                lifetime: AgentSecurityLifetime::Connection,
                stop_conditions: external_stop_conditions(),
                unattended_eligible: false,
            },
            #[cfg(any(target_os = "linux", test))]
            ExternalProcessLaunchProfile::LinuxRestrictedOffline => AgentSecurityProfileInfo {
                id: AgentSecurityProfileId::ExternalLinuxRestrictedOfflineV1,
                effective_mounts: AgentEffectiveMounts::SystemRuntimeAgentAndReadOnlyBundle,
                writable_roots: AgentWritableRoots::PrivateTemporaryOnly,
                network_policy: AgentNetworkPolicy::Isolated,
                credential_exposure: AgentCredentialExposure::LaunchEnvironmentOnly,
                lifetime: AgentSecurityLifetime::Connection,
                stop_conditions: external_stop_conditions(),
                unattended_eligible: true,
            },
            #[cfg(target_os = "windows")]
            ExternalProcessLaunchProfile::WindowsRestrictedAppContainer => {
                AgentSecurityProfileInfo {
                    id: AgentSecurityProfileId::ExternalWindowsRestrictedAppContainerV1,
                    effective_mounts: AgentEffectiveMounts::AppContainerRuntimeAndMediatedBundle,
                    writable_roots: AgentWritableRoots::PrivateTemporaryOnly,
                    network_policy: AgentNetworkPolicy::Isolated,
                    credential_exposure: AgentCredentialExposure::LaunchEnvironmentOnly,
                    lifetime: AgentSecurityLifetime::Connection,
                    stop_conditions: external_stop_conditions(),
                    unattended_eligible: true,
                }
            }
        };
        Self {
            evidence_source: AgentSecurityEvidenceSource::ExternalProcessLauncher,
            process_containment,
            profile,
        }
    }

    pub(crate) fn unattended_eligible(&self) -> bool {
        self.profile.unattended_eligible
    }
}

fn external_stop_conditions() -> Vec<AgentSecurityStopCondition> {
    vec![
        AgentSecurityStopCondition::Disconnect,
        AgentSecurityStopCondition::ApplicationExit,
        AgentSecurityStopCondition::HostFailure,
    ]
}
