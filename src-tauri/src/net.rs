//! The only way Kairo talks to the network, and only for opt-in features (site
//! icons, the update check). It uses the system's curl (part of macOS,
//! Windows 10 and later, and nearly every Linux system), so Kairo itself ships
//! no networking code: HTTPS only, redirects to HTTPS only, small and quick.

use std::{
    io::Read,
    process::{Command, Stdio},
};

/// GET `url` over HTTPS, giving up on anything slow or bigger than `max` bytes.
pub fn get(url: &str, max: usize, user_agent: &str, accept: Option<&str>) -> Option<Vec<u8>> {
    let max_s = max.to_string();
    let mut cmd = Command::new("curl");
    cmd.args([
        "--silent",
        "--fail",
        "--location",
        "--max-redirs",
        "5",
        "--max-time",
        "8",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--max-filesize",
        &max_s,
        "--user-agent",
        user_agent,
    ]);
    if let Some(accept) = accept {
        cmd.args(["--header", &format!("Accept: {accept}")]);
    }
    cmd.arg(url).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window flashing up.
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().ok()?;
    let mut body = Vec::new();
    let read = child.stdout.take()?.take(max as u64 + 1).read_to_end(&mut body);
    if read.is_err() || body.len() > max {
        let _ = child.kill();
        let _ = child.wait();
        return None;
    }
    let ok = child.wait().ok()?.success();
    (ok && !body.is_empty()).then_some(body)
}
