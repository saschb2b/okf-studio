// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let mut args = std::env::args_os().skip(1);
    let mode = args.next();
    if mode.as_deref() == Some(std::ffi::OsStr::new("--okf-mcp-grant")) {
        let Some(grant_file) = args.next() else {
            eprintln!("OKF Studio MCP requires a one-shot grant.");
            std::process::exit(2);
        };
        let Some(token) = args.next() else {
            eprintln!("OKF Studio MCP requires its one-shot token.");
            std::process::exit(2);
        };
        if args.next().is_some() {
            eprintln!("OKF Studio MCP accepts exactly one grant and token.");
            std::process::exit(2);
        }
        if let Err(message) = okf_viewer_lib::run_agent_mcp_grant(
            grant_file.into(),
            token.to_string_lossy().into_owned(),
        ) {
            eprintln!("{message}");
            std::process::exit(1);
        }
        return;
    }
    if mode.as_deref() == Some(std::ffi::OsStr::new("--extract-pdf")) {
        if args.next().is_some() {
            eprintln!("OKF Studio PDF extraction accepts no path arguments.");
            std::process::exit(2);
        }
        if let Err(message) = okf_viewer_lib::run_pdf_extractor() {
            eprintln!("{message}");
            std::process::exit(1);
        }
        return;
    }
    #[cfg(target_os = "windows")]
    if mode.as_deref() == Some(std::ffi::OsStr::new("--okf-windows-agent-sandbox")) {
        let Some(executable) = args.next() else {
            eprintln!("OKF Studio's Windows sandbox requires an executable path.");
            std::process::exit(2);
        };
        let arguments = args
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect();
        match okf_viewer_lib::run_windows_agent_sandbox(executable.into(), arguments) {
            Ok(exit_code) => std::process::exit(i32::try_from(exit_code).unwrap_or(1)),
            Err(message) => {
                eprintln!("{message}");
                std::process::exit(1);
            }
        }
    }
    okf_viewer_lib::run()
}
