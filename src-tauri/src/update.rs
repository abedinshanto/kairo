//! Only when the user turns on "Check for updates": once a day, ask GitHub
//! which Kairo release is the latest. One small HTTPS request that carries
//! nothing about the user (just "Kairo" and its version, as GitHub requires a
//! User-Agent). If it's newer than this one, the app says so; nothing is
//! downloaded or installed by itself.

use std::{thread, time::Duration};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::AppState;

const LATEST: &str = "https://api.github.com/repos/abedinshanto/kairo/releases/latest";
pub const RELEASES: &str = "https://github.com/abedinshanto/kairo/releases/latest";
const EVERY_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub url: String,
}

/// What the last check found, and when it ran.
#[derive(Default)]
pub struct Updates {
    pub found: Mutex<Option<UpdateInfo>>,
    last: Mutex<i64>,
}

/// From the once-a-minute ticker: checks at most once a day, in the background.
#[cfg_attr(mobile, allow(dead_code))]
pub fn tick<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    if !state.settings.read().check_updates {
        return;
    }
    let updates = app.state::<Updates>();
    let now = crate::now_ms();
    {
        let mut last = updates.last.lock();
        if now - *last < EVERY_MS {
            return;
        }
        // Try again in an hour if this one fails (offline); a success waits a day.
        *last = now - EVERY_MS + 60 * 60 * 1000;
    }
    let app = app.clone();
    thread::spawn(move || {
        // Not in the first moments after launch.
        thread::sleep(Duration::from_secs(20));
        check_now(&app);
    });
}

/// Ask now; remembers and announces a newer release.
pub fn check_now<R: Runtime>(app: &AppHandle<R>) -> Option<UpdateInfo> {
    let ua = format!("Kairo/{}", env!("CARGO_PKG_VERSION"));
    let body = crate::net::get(LATEST, 512 * 1024, &ua, Some("application/vnd.github+json"))?;
    let found = newer_release(&String::from_utf8_lossy(&body), env!("CARGO_PKG_VERSION"));
    let updates = app.state::<Updates>();
    *updates.last.lock() = crate::now_ms();
    let changed = *updates.found.lock() != found;
    *updates.found.lock() = found.clone();
    if changed {
        if let Some(info) = &found {
            let _ = app.emit("update://available", info);
        }
    }
    found
}

/// The release in GitHub's answer, if it's newer than `current`.
fn newer_release(json: &str, current: &str) -> Option<UpdateInfo> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    if value.get("draft").and_then(|d| d.as_bool()) == Some(true) || value.get("prerelease").and_then(|d| d.as_bool()) == Some(true) {
        return None;
    }
    let tag = value.get("tag_name")?.as_str()?;
    let latest = parse(tag)?;
    (latest > parse(current)?).then(|| UpdateInfo {
        version: tag.trim_start_matches('v').to_string(),
        url: RELEASES.to_string(),
    })
}

/// "v0.4.1" → (0, 4, 1).
fn parse(v: &str) -> Option<(u32, u32, u32)> {
    let mut parts = v.trim().trim_start_matches('v').split(['.', '-', '+']);
    Some((parts.next()?.parse().ok()?, parts.next()?.parse().ok()?, parts.next().unwrap_or("0").parse().ok()?))
}

/// Open the releases page in the browser (a fixed address, never one from outside).
pub fn open_releases() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut cmd = {
        use std::os::windows::process::CommandExt;
        let mut c = std::process::Command::new("rundll32");
        c.arg("url.dll,FileProtocolHandler");
        c.creation_flags(0x0800_0000);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = std::process::Command::new("xdg-open");
    cmd.arg(RELEASES).spawn().map(|_| ()).map_err(|e| format!("Couldn't open the browser: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_newer_releases_count() {
        let json = r#"{"tag_name":"v0.4.1","draft":false,"prerelease":false,"html_url":"https://example.com"}"#;
        assert_eq!(newer_release(json, "0.4.0").map(|u| u.version), Some("0.4.1".into()));
        assert_eq!(newer_release(json, "0.4.1"), None);
        assert_eq!(newer_release(json, "0.10.0"), None);
        let pre = r#"{"tag_name":"v9.0.0","prerelease":true}"#;
        assert_eq!(newer_release(pre, "0.4.0"), None);
        assert_eq!(newer_release("not json", "0.4.0"), None);
        assert_eq!(parse("v1.2"), Some((1, 2, 0)));
    }
}
