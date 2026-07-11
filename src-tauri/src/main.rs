// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() == Some(std::ffi::OsStr::new("--okf-mcp")) {
        let Some(bundle_root) = args.next() else {
            eprintln!("OKF Studio MCP requires a bundle root.");
            std::process::exit(2);
        };
        if args.next().is_some() {
            eprintln!("OKF Studio MCP accepts exactly one bundle root.");
            std::process::exit(2);
        }
        if let Err(message) = okf_viewer_lib::run_agent_mcp(bundle_root.into()) {
            eprintln!("{message}");
            std::process::exit(1);
        }
        return;
    }
    okf_viewer_lib::run()
}
