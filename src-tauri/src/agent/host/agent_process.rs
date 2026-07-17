//! Owns an external ACP agent and every process it starts.
//!
//! This is lifecycle containment only. It does not restrict filesystem or
//! network access.

use std::io;
use tokio::process::{Child, Command};

pub(crate) fn configure(command: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;

        // A zero process-group ID makes the child the leader of a new group.
        // This runs in the child setup before exec, so descendants inherit it.
        command.as_std_mut().process_group(0);
    }

    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

pub(crate) struct AgentProcessTree {
    platform: PlatformProcessTree,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum AgentProcessContainment {
    #[cfg(unix)]
    PosixProcessGroup,
    #[cfg(windows)]
    WindowsJobObject,
}

impl AgentProcessTree {
    pub(crate) fn attach(child: &Child) -> io::Result<Self> {
        Ok(Self {
            platform: PlatformProcessTree::attach(child)?,
        })
    }

    pub(crate) fn terminate(&mut self) {
        self.platform.terminate();
    }

    pub(crate) fn containment(&self) -> AgentProcessContainment {
        self.platform.containment()
    }
}

impl Drop for AgentProcessTree {
    fn drop(&mut self) {
        self.terminate();
    }
}

#[cfg(unix)]
struct PlatformProcessTree {
    process_group: Option<i32>,
}

#[cfg(unix)]
impl PlatformProcessTree {
    fn attach(child: &Child) -> io::Result<Self> {
        let process_id = child
            .id()
            .ok_or_else(|| io::Error::other("agent process has no process ID"))?;
        let process_group = i32::try_from(process_id)
            .map_err(|_| io::Error::other("agent process ID exceeds the platform range"))?;
        Ok(Self {
            process_group: Some(process_group),
        })
    }

    fn terminate(&mut self) {
        let Some(process_group) = self.process_group.take() else {
            return;
        };
        // Negative PIDs address a process group. The child was made the group
        // leader before exec, so this cannot target Studio's own group.
        unsafe {
            libc::kill(-process_group, libc::SIGKILL);
        }
    }

    fn containment(&self) -> AgentProcessContainment {
        AgentProcessContainment::PosixProcessGroup
    }
}

#[cfg(windows)]
struct PlatformProcessTree {
    job: Option<usize>,
}

#[cfg(windows)]
impl PlatformProcessTree {
    fn attach(child: &Child) -> io::Result<Self> {
        use std::os::windows::io::RawHandle;
        use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };

        let process = child
            .raw_handle()
            .ok_or_else(|| io::Error::other("agent process has no process handle"))?
            as RawHandle as HANDLE;
        let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if job.is_null() {
            return Err(io::Error::last_os_error());
        }

        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                (&raw const limits).cast(),
                std::mem::size_of_val(&limits) as u32,
            )
        };
        if configured == 0 {
            let error = io::Error::last_os_error();
            unsafe {
                CloseHandle(job);
            }
            return Err(error);
        }

        let assigned = unsafe { AssignProcessToJobObject(job, process) };
        if assigned == 0 {
            let error = io::Error::last_os_error();
            unsafe {
                CloseHandle(job);
            }
            return Err(error);
        }

        Ok(Self {
            job: Some(job as usize),
        })
    }

    fn terminate(&mut self) {
        use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
        use windows_sys::Win32::System::JobObjects::TerminateJobObject;

        let Some(job) = self.job.take() else {
            return;
        };
        let job = job as HANDLE;
        unsafe {
            TerminateJobObject(job, 1);
            CloseHandle(job);
        }
    }

    fn containment(&self) -> AgentProcessContainment {
        AgentProcessContainment::WindowsJobObject
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};
    use std::time::{Duration, SystemTime};

    const FIXTURE_ROLE: &str = "OKF_STUDIO_PROCESS_TREE_FIXTURE";
    const FIXTURE_PID_FILE: &str = "OKF_STUDIO_PROCESS_TREE_PID_FILE";
    const FIXTURE_READY_FILE: &str = "OKF_STUDIO_PROCESS_TREE_READY_FILE";

    #[test]
    #[ignore = "subprocess fixture invoked by dropping_ownership_stops_agent_descendants"]
    fn process_tree_fixture() {
        let role = std::env::var(FIXTURE_ROLE).expect("fixture role");
        if role == "leaf" {
            std::thread::sleep(Duration::from_secs(60));
            return;
        }

        assert_eq!(role, "parent");
        let ready_file = std::env::var_os(FIXTURE_READY_FILE).expect("fixture ready file");
        for _ in 0..100 {
            if Path::new(&ready_file).exists() {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(Path::new(&ready_file).exists(), "fixture was not released");
        let pid_file = PathBuf::from(
            std::env::var_os(FIXTURE_PID_FILE).expect("fixture PID file"),
        );
        let mut child =
            std::process::Command::new(std::env::current_exe().expect("test executable"))
                .args([
                    "--exact",
                    "agent_process::tests::process_tree_fixture",
                    "--ignored",
                ])
                .env(FIXTURE_ROLE, "leaf")
                .spawn()
                .expect("spawn leaf fixture");
        let pending_pid_file = pid_file.with_extension("pid.tmp");
        std::fs::write(&pending_pid_file, child.id().to_string())
            .expect("write descendant PID");
        std::fs::rename(pending_pid_file, pid_file).expect("publish descendant PID");
        let _ = child.wait();
    }

    #[tokio::test]
    async fn dropping_ownership_stops_agent_descendants() {
        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let pid_file = std::env::temp_dir().join(format!(
            "okf-studio-process-tree-{}-{unique}.pid",
            std::process::id()
        ));
        let ready_file = pid_file.with_extension("ready");
        let mut command = Command::new(std::env::current_exe().expect("test executable"));
        command
            .args([
                "--exact",
                "agent_process::tests::process_tree_fixture",
                "--ignored",
            ])
            .env(FIXTURE_ROLE, "parent")
            .env(FIXTURE_PID_FILE, &pid_file)
            .env(FIXTURE_READY_FILE, &ready_file)
            .kill_on_drop(true);
        configure(&mut command);
        let mut child = command.spawn().expect("spawn parent fixture");
        let tree = AgentProcessTree::attach(&child).expect("attach process tree");
        std::fs::write(&ready_file, []).expect("release process-tree fixture");
        let descendant = wait_for_descendant(&pid_file).await;
        assert!(process_is_running(descendant));

        drop(tree);
        let _ = child.wait().await;
        for _ in 0..50 {
            if !process_is_running(descendant) {
                let _ = std::fs::remove_file(&pid_file);
                let _ = std::fs::remove_file(&ready_file);
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        let _ = std::fs::remove_file(&pid_file);
        let _ = std::fs::remove_file(&ready_file);
        panic!("agent descendant {descendant} survived tree termination");
    }

    async fn wait_for_descendant(path: &Path) -> u32 {
        for _ in 0..100 {
            if let Ok(value) = std::fs::read_to_string(path) {
                if let Ok(process_id) = value.trim().parse::<u32>() {
                    if process_id > 0 {
                        return process_id;
                    }
                }
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("process-tree fixture did not report its descendant");
    }

    #[cfg(unix)]
    fn process_is_running(process_id: u32) -> bool {
        let Ok(process_id) = i32::try_from(process_id) else {
            return false;
        };
        let result = unsafe { libc::kill(process_id, 0) };
        result == 0 || io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
    }

    #[cfg(windows)]
    fn process_is_running(process_id: u32) -> bool {
        use windows_sys::Win32::Foundation::{CloseHandle, WAIT_TIMEOUT};
        use windows_sys::Win32::System::Threading::{OpenProcess, WaitForSingleObject};

        const SYNCHRONIZE: u32 = 0x0010_0000;

        let process = unsafe { OpenProcess(SYNCHRONIZE, 0, process_id) };
        if process.is_null() {
            return false;
        }
        let status = unsafe { WaitForSingleObject(process, 0) };
        unsafe {
            CloseHandle(process);
        }
        status == WAIT_TIMEOUT
    }
}
