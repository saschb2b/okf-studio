//! Native Windows AppContainer launcher for self-contained ACP executables.
//!
//! The external process receives no filesystem grant to the bundle and no
//! network capability. Bundle access stays behind Studio's bounded ACP file
//! methods. The selected executable is copied into a fresh per-launch
//! AppContainer profile, and the outer helper remains attached to Studio's
//! kill-on-close Job Object.

#[cfg(target_os = "windows")]
mod windows {
    use std::ffi::{OsStr, OsString};
    use std::fs;
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use std::path::{Path, PathBuf};
    use std::ptr::{null, null_mut};

    use windows_sys::Win32::Foundation::{CloseHandle, LocalFree, HANDLE, WAIT_TIMEOUT};
    use windows_sys::Win32::Security::Authorization::ConvertSidToStringSidW;
    use windows_sys::Win32::Security::Isolation::{
        CreateAppContainerProfile, DeleteAppContainerProfile, GetAppContainerFolderPath,
    };
    use windows_sys::Win32::Security::{FreeSid, PSID, SECURITY_CAPABILITIES};
    use windows_sys::Win32::System::Com::CoTaskMemFree;
    use windows_sys::Win32::System::Console::{
        GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
    };
    use windows_sys::Win32::System::Threading::{
        CreateProcessW, DeleteProcThreadAttributeList, GetCurrentProcessId, GetExitCodeProcess,
        InitializeProcThreadAttributeList, OpenProcess, UpdateProcThreadAttribute,
        WaitForSingleObject, CREATE_NO_WINDOW, EXTENDED_STARTUPINFO_PRESENT, INFINITE,
        PROCESS_INFORMATION, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
        PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, STARTF_USESTDHANDLES, STARTUPINFOEXW,
    };

    const DISPLAY_NAME: &str = "OKF Studio restricted agent";
    const DESCRIPTION: &str = "Ephemeral offline AppContainer for an OKF Studio ACP agent";
    const PROFILE_PREFIX: &str = "OKFStudio.Agent.";
    const MAX_STALE_PROFILES: usize = 64;

    pub(crate) fn preflight() -> Result<(), String> {
        cleanup_stale_profiles();
        let identity = format!("{PROFILE_PREFIX}Probe.{}", uuid::Uuid::new_v4().simple());
        let profile = AppContainerProfile::create(&identity, false)?;
        let folder = profile.folder()?;
        if !folder.is_dir() {
            return Err(
                "Windows created an AppContainer without an accessible profile folder.".to_string(),
            );
        }
        Ok(())
    }

    pub(crate) fn run(source: &Path, arguments: &[String]) -> Result<u32, String> {
        cleanup_stale_profiles();
        let source = source
            .canonicalize()
            .map_err(|error| format!("Studio could not resolve the restricted agent: {error}"))?;
        if !source.is_file()
            || !source
                .extension()
                .and_then(OsStr::to_str)
                .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
        {
            return Err(
                "Windows Restricted offline requires one self-contained .exe file.".to_string(),
            );
        }

        let identity = format!("{PROFILE_PREFIX}{}", uuid::Uuid::new_v4().simple());
        let profile = AppContainerProfile::create(&identity, true)?;
        let folder = profile.folder()?;
        let executable = folder.join("agent.exe");
        fs::copy(&source, &executable).map_err(|error| {
            format!("Studio could not copy the agent into its AppContainer: {error}")
        })?;

        spawn(&profile, &folder, &executable, arguments)
    }

    struct AppContainerProfile {
        identity: Vec<u16>,
        sid: PSID,
        ledger: Option<PathBuf>,
    }

    impl AppContainerProfile {
        fn create(identity: &str, track_for_recovery: bool) -> Result<Self, String> {
            let identity_text = identity;
            let identity = wide(identity_text);
            let display_name = wide(DISPLAY_NAME);
            let description = wide(DESCRIPTION);
            let mut sid = null_mut();
            let result = unsafe {
                CreateAppContainerProfile(
                    identity.as_ptr(),
                    display_name.as_ptr(),
                    description.as_ptr(),
                    null(),
                    0,
                    &mut sid,
                )
            };
            if result < 0 || sid.is_null() {
                return Err(format!(
                    "Windows AppContainer creation failed (HRESULT 0x{:08X}).",
                    result as u32
                ));
            }
            let mut profile = Self {
                identity,
                sid,
                ledger: None,
            };
            if track_for_recovery {
                profile.ledger = Some(write_profile_ledger(identity_text)?);
            }
            Ok(profile)
        }

        fn folder(&self) -> Result<PathBuf, String> {
            let mut sid_string = null_mut();
            if unsafe { ConvertSidToStringSidW(self.sid, &mut sid_string) } == 0
                || sid_string.is_null()
            {
                return Err(last_os_error(
                    "Windows could not encode the AppContainer identity",
                ));
            }

            let mut folder = null_mut();
            let result = unsafe { GetAppContainerFolderPath(sid_string, &mut folder) };
            unsafe {
                LocalFree(sid_string.cast());
            }
            if result < 0 || folder.is_null() {
                return Err(format!(
                    "Windows could not locate the AppContainer profile (HRESULT 0x{:08X}).",
                    result as u32
                ));
            }
            let path = PathBuf::from(OsString::from_wide(unsafe { wide_slice(folder) }));
            unsafe {
                CoTaskMemFree(folder.cast());
            }
            Ok(path)
        }
    }

    impl Drop for AppContainerProfile {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteAppContainerProfile(self.identity.as_ptr());
                FreeSid(self.sid);
            }
            if let Some(ledger) = &self.ledger {
                let _ = fs::remove_file(ledger);
            }
        }
    }

    fn profile_ledger_directory() -> PathBuf {
        std::env::temp_dir().join("okf-studio-appcontainer-profiles")
    }

    fn write_profile_ledger(identity: &str) -> Result<PathBuf, String> {
        let directory = profile_ledger_directory();
        fs::create_dir_all(&directory).map_err(|error| {
            format!("Studio could not create its AppContainer recovery ledger: {error}")
        })?;
        let path = directory.join(format!("{}.profile", unsafe { GetCurrentProcessId() }));
        fs::write(&path, identity).map_err(|error| {
            format!("Studio could not record its AppContainer recovery state: {error}")
        })?;
        Ok(path)
    }

    fn cleanup_stale_profiles() {
        let Ok(entries) = fs::read_dir(profile_ledger_directory()) else {
            return;
        };
        for entry in entries.flatten().take(MAX_STALE_PROFILES) {
            let path = entry.path();
            if path.extension().and_then(OsStr::to_str) != Some("profile") {
                continue;
            }
            let Some(process_id) = path
                .file_stem()
                .and_then(OsStr::to_str)
                .and_then(|value| value.parse::<u32>().ok())
            else {
                continue;
            };
            if process_is_running(process_id) {
                continue;
            }
            let Ok(identity) = fs::read_to_string(&path) else {
                continue;
            };
            if identity.starts_with(PROFILE_PREFIX)
                && identity.len() <= 64
                && identity.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
                })
            {
                let identity = wide(&identity);
                unsafe {
                    let _ = DeleteAppContainerProfile(identity.as_ptr());
                }
                let _ = fs::remove_file(path);
            }
        }
    }

    fn process_is_running(process_id: u32) -> bool {
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

    fn spawn(
        profile: &AppContainerProfile,
        current_directory: &Path,
        executable: &Path,
        arguments: &[String],
    ) -> Result<u32, String> {
        let handles = [
            unsafe { GetStdHandle(STD_INPUT_HANDLE) },
            unsafe { GetStdHandle(STD_OUTPUT_HANDLE) },
            unsafe { GetStdHandle(STD_ERROR_HANDLE) },
        ];
        if handles
            .iter()
            .any(|handle| handle.is_null() || *handle == -1_isize as HANDLE)
        {
            return Err(
                "The Windows sandbox helper did not receive its ACP stdio pipes.".to_string(),
            );
        }

        let mut capabilities = SECURITY_CAPABILITIES {
            AppContainerSid: profile.sid,
            Capabilities: null_mut(),
            CapabilityCount: 0,
            Reserved: 0,
        };
        let mut attribute_bytes = 0usize;
        unsafe {
            InitializeProcThreadAttributeList(null_mut(), 2, 0, &mut attribute_bytes);
        }
        if attribute_bytes == 0 {
            return Err(last_os_error(
                "Windows could not size the AppContainer launch attributes",
            ));
        }
        let mut attribute_storage = vec![0usize; attribute_bytes.div_ceil(size_of::<usize>())];
        let attribute_list = attribute_storage.as_mut_ptr().cast();
        if unsafe { InitializeProcThreadAttributeList(attribute_list, 2, 0, &mut attribute_bytes) }
            == 0
        {
            return Err(last_os_error(
                "Windows could not initialize the AppContainer launch attributes",
            ));
        }
        let attributes = AttributeList(attribute_list);
        if unsafe {
            UpdateProcThreadAttribute(
                attributes.0,
                0,
                PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES as usize,
                (&mut capabilities as *mut SECURITY_CAPABILITIES).cast(),
                size_of::<SECURITY_CAPABILITIES>(),
                null_mut(),
                null(),
            )
        } == 0
        {
            return Err(last_os_error(
                "Windows rejected the AppContainer security capabilities",
            ));
        }
        if unsafe {
            UpdateProcThreadAttribute(
                attributes.0,
                0,
                PROC_THREAD_ATTRIBUTE_HANDLE_LIST as usize,
                handles.as_ptr().cast(),
                size_of_val(&handles),
                null_mut(),
                null(),
            )
        } == 0
        {
            return Err(last_os_error(
                "Windows rejected the restricted stdio handle list",
            ));
        }

        let executable_wide = wide_os(executable.as_os_str());
        let current_directory = wide_os(current_directory.as_os_str());
        let mut command_line = windows_command_line(executable.as_os_str(), arguments);
        let mut startup = STARTUPINFOEXW::default();
        startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
        startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
        startup.StartupInfo.hStdInput = handles[0];
        startup.StartupInfo.hStdOutput = handles[1];
        startup.StartupInfo.hStdError = handles[2];
        startup.lpAttributeList = attributes.0;
        let mut process = PROCESS_INFORMATION::default();
        let created = unsafe {
            CreateProcessW(
                executable_wide.as_ptr(),
                command_line.as_mut_ptr(),
                null(),
                null(),
                1,
                EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW,
                null(),
                current_directory.as_ptr(),
                (&startup as *const STARTUPINFOEXW).cast(),
                &mut process,
            )
        };
        if created == 0 {
            return Err(last_os_error(
                "Windows could not start the agent inside AppContainer",
            ));
        }
        let process_handles = ProcessHandles(process);
        let wait = unsafe { WaitForSingleObject(process_handles.0.hProcess, INFINITE) };
        if wait != 0 {
            return Err(last_os_error(
                "Windows could not wait for the AppContainer agent",
            ));
        }
        let mut exit_code = 1u32;
        if unsafe { GetExitCodeProcess(process_handles.0.hProcess, &mut exit_code) } == 0 {
            return Err(last_os_error(
                "Windows could not read the AppContainer agent exit status",
            ));
        }
        Ok(exit_code)
    }

    struct AttributeList(windows_sys::Win32::System::Threading::LPPROC_THREAD_ATTRIBUTE_LIST);

    impl Drop for AttributeList {
        fn drop(&mut self) {
            unsafe { DeleteProcThreadAttributeList(self.0) };
        }
    }

    struct ProcessHandles(PROCESS_INFORMATION);

    impl Drop for ProcessHandles {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0.hThread);
                CloseHandle(self.0.hProcess);
            }
        }
    }

    fn windows_command_line(executable: &OsStr, arguments: &[String]) -> Vec<u16> {
        let mut command_line = Vec::new();
        append_quoted(
            &mut command_line,
            &executable.encode_wide().collect::<Vec<_>>(),
        );
        for argument in arguments {
            command_line.push(b' ' as u16);
            append_quoted(
                &mut command_line,
                &OsStr::new(argument).encode_wide().collect::<Vec<_>>(),
            );
        }
        command_line.push(0);
        command_line
    }

    fn append_quoted(output: &mut Vec<u16>, value: &[u16]) {
        let quote = b'"' as u16;
        let slash = b'\\' as u16;
        let needs_quotes = value.is_empty()
            || value
                .iter()
                .any(|character| matches!(*character, 0x09 | 0x20 | 0x22));
        if !needs_quotes {
            output.extend_from_slice(value);
            return;
        }
        output.push(quote);
        let mut slashes = 0usize;
        for character in value {
            if *character == slash {
                slashes += 1;
                continue;
            }
            if *character == quote {
                output.extend(std::iter::repeat_n(slash, slashes * 2 + 1));
            } else {
                output.extend(std::iter::repeat_n(slash, slashes));
            }
            slashes = 0;
            output.push(*character);
        }
        output.extend(std::iter::repeat_n(slash, slashes * 2));
        output.push(quote);
    }

    fn wide(value: &str) -> Vec<u16> {
        wide_os(OsStr::new(value))
    }

    fn wide_os(value: &OsStr) -> Vec<u16> {
        value.encode_wide().chain([0]).collect()
    }

    unsafe fn wide_slice<'a>(value: *const u16) -> &'a [u16] {
        let mut length = 0usize;
        while unsafe { *value.add(length) } != 0 {
            length += 1;
        }
        unsafe { std::slice::from_raw_parts(value, length) }
    }

    fn last_os_error(context: &str) -> String {
        format!("{context}: {}", std::io::Error::last_os_error())
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        const SENTINEL_ENV: &str = "OKF_STUDIO_APPCONTAINER_TEST_SENTINEL";

        #[test]
        fn quotes_windows_arguments_without_shell_parsing() {
            let command = windows_command_line(
                OsStr::new(r"C:\Program Files\agent.exe"),
                &[
                    "--stdio".to_string(),
                    "two words".to_string(),
                    r#"quote\"value"#.to_string(),
                    r"trailing\".to_string(),
                ],
            );
            let rendered = String::from_utf16_lossy(&command[..command.len() - 1]);
            assert_eq!(
                rendered,
                r#""C:\Program Files\agent.exe" --stdio "two words" "quote\\\"value" trailing\"#
            );
        }

        #[test]
        #[ignore = "subprocess fixture invoked by appcontainer_enforces_process_and_file_isolation"]
        fn appcontainer_fixture() {
            use windows_sys::Win32::Security::{
                GetTokenInformation, TokenIsAppContainer, TOKEN_QUERY,
            };
            use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

            let mut token = null_mut();
            assert_ne!(
                unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) },
                0,
                "open process token"
            );
            let token = TokenHandle(token);
            let mut is_appcontainer = 0u32;
            let mut returned = 0u32;
            assert_ne!(
                unsafe {
                    GetTokenInformation(
                        token.0,
                        TokenIsAppContainer,
                        (&mut is_appcontainer as *mut u32).cast(),
                        size_of::<u32>() as u32,
                        &mut returned,
                    )
                },
                0,
                "read AppContainer token state"
            );
            assert_eq!(is_appcontainer, 1, "fixture must run inside AppContainer");

            let sentinel = PathBuf::from(std::env::var_os(SENTINEL_ENV).expect("sentinel path"));
            assert!(
                fs::read(&sentinel).is_err(),
                "AppContainer unexpectedly read an ungranted host file"
            );
            let scratch = std::env::current_dir()
                .expect("AppContainer current directory")
                .join("scratch.txt");
            fs::write(&scratch, b"private scratch").expect("write private AppContainer scratch");
            assert_eq!(
                fs::read(&scratch).expect("read scratch"),
                b"private scratch"
            );
        }

        #[test]
        fn appcontainer_enforces_process_and_file_isolation() {
            let sentinel = std::env::temp_dir().join(format!(
                "okf-studio-appcontainer-sentinel-{}",
                uuid::Uuid::new_v4()
            ));
            fs::write(&sentinel, b"host only").expect("write sentinel");
            std::env::set_var(SENTINEL_ENV, &sentinel);
            let executable = std::env::current_exe().expect("test executable");
            let result = run(
                &executable,
                &[
                    "--exact".to_string(),
                    "agent_windows_sandbox::windows::tests::appcontainer_fixture".to_string(),
                    "--ignored".to_string(),
                    "--nocapture".to_string(),
                ],
            );
            std::env::remove_var(SENTINEL_ENV);
            let _ = fs::remove_file(&sentinel);
            assert_eq!(result.expect("run AppContainer fixture"), 0);
        }

        struct TokenHandle(HANDLE);

        impl Drop for TokenHandle {
            fn drop(&mut self) {
                unsafe { CloseHandle(self.0) };
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub(crate) use windows::{preflight, run};
