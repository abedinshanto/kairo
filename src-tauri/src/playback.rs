//! Watching isn't stepping away. A video or a call gets no keyboard or mouse
//! input, so idle detection alone would stop counting a film after a few
//! minutes. Apps that play video or hold a call keep the screen awake while
//! they do; when the app in front is doing that, Kairo keeps counting.

/// Whether the app in front is keeping the screen awake (playing a video, in a call).
/// `media_app`: its category is one where that's expected (video, meetings), used
/// where the system can only say that *some* app is keeping the screen on.
#[cfg(target_os = "macos")]
pub fn front_app_playing(app_name: &str, app_id: &str, browser: bool, _media_app: bool) -> bool {
    let Ok(out) = std::process::Command::new("/usr/bin/pmset")
        .args(["-g", "assertions"])
        .output()
    else {
        return false;
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let playing = display_holders(&text).any(|holder| holder_is(holder, app_name, app_id, browser));
    playing
}

#[cfg(target_os = "windows")]
pub fn front_app_playing(_app_name: &str, _app_id: &str, browser: bool, media_app: bool) -> bool {
    use windows::Win32::System::Power::{CallNtPowerInformation, SystemExecutionState};
    const ES_DISPLAY_REQUIRED: u32 = 0x2;
    if !(browser || media_app) {
        return false;
    }
    let mut state: u32 = 0;
    // SAFETY: the output buffer is a u32, as SystemExecutionState expects.
    let status = unsafe {
        CallNtPowerInformation(
            SystemExecutionState,
            None,
            0,
            Some(&mut state as *mut u32 as *mut core::ffi::c_void),
            std::mem::size_of::<u32>() as u32,
        )
    };
    status.is_ok() && state & ES_DISPLAY_REQUIRED != 0
}

#[cfg(target_os = "linux")]
pub fn front_app_playing(_app_name: &str, _app_id: &str, browser: bool, media_app: bool) -> bool {
    use std::process::Command;
    if !(browser || media_app) {
        return false;
    }
    let says_true = |args: &[&str]| {
        Command::new("gdbus")
            .args(args)
            .output()
            .is_ok_and(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).contains("true"))
    };
    // GNOME: is idle inhibited (flag 8)? KDE and others: any inhibitor at all?
    says_true(&[
        "call", "--session", "--dest", "org.gnome.SessionManager", "--object-path",
        "/org/gnome/SessionManager", "--method", "org.gnome.SessionManager.IsInhibited", "8",
    ]) || says_true(&[
        "call", "--session", "--dest", "org.freedesktop.PowerManagement", "--object-path",
        "/org/freedesktop/PowerManagement/Inhibit", "--method",
        "org.freedesktop.PowerManagement.Inhibit.HasInhibit",
    ])
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn front_app_playing(_app_name: &str, _app_id: &str, _browser: bool, _media_app: bool) -> bool {
    false
}

/// Process names holding a "keep the display on" assertion, from `pmset -g assertions`:
/// `   pid 812(Google Chrome): [0x…] 00:41:27 PreventUserIdleDisplaySleep named: "Video Wake Lock"`
#[cfg(any(test, target_os = "macos"))]
fn display_holders(text: &str) -> impl Iterator<Item = &str> {
    text.lines().filter_map(|line| {
        let rest = line.trim_start().strip_prefix("pid ")?;
        let open = rest.find('(')?;
        // Names can hold brackets themselves: "Google Chrome Helper (Renderer)".
        let close = open + rest[open..].find("): ")?;
        let tail = &rest[close..];
        let display = tail.contains("PreventUserIdleDisplaySleep") || tail.contains("NoDisplaySleepAssertion");
        display.then(|| &rest[open + 1..close])
    })
}

/// Whether a process holding the assertion belongs to the app in front. Browsers'
/// helper processes share their name ("Google Chrome Helper"); Safari plays media
/// in WebKit's own processes.
#[cfg(any(test, target_os = "macos"))]
fn holder_is(holder: &str, app_name: &str, app_id: &str, browser: bool) -> bool {
    let holder = holder.to_lowercase();
    let name = app_name.trim().to_lowercase();
    (!name.is_empty() && holder.starts_with(&name))
        || (!app_id.is_empty() && holder.starts_with(app_id))
        || (browser && holder.contains("webkit"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PMSET: &str = r#"Assertion status system-wide:
   BackgroundTask                 0
   PreventUserIdleDisplaySleep    1
   PreventUserIdleSystemSleep     1
Listed by owning process:
   pid 335(coreaudiod): [0x0000000100018a5d] 00:41:30 PreventUserIdleSystemSleep named: "com.apple.audio.context"
   pid 812(Google Chrome Helper (Renderer)): [0x00012a3b00018c2d] 00:41:27 PreventUserIdleDisplaySleep named: "Video Wake Lock"
   pid 9(zoom.us): [0x00012a3b00018c2e] 00:02:00 NoDisplaySleepAssertion named: "Zoom meeting"
Kernel Assertions: 0x4=USB
   id=500  level=255 0x4=USB mod=05/11/2026, 09:12 description=com.apple.usb.externaldevice"#;

    #[test]
    fn finds_who_keeps_the_display_on() {
        let holders: Vec<&str> = display_holders(PMSET).collect();
        assert_eq!(holders, vec!["Google Chrome Helper (Renderer)", "zoom.us"]);
    }

    #[test]
    fn matches_the_app_in_front_only() {
        assert!(holder_is("Google Chrome Helper (Renderer)", "Google Chrome", "google chrome", true));
        assert!(holder_is("zoom.us", "zoom.us", "zoom.us", false));
        assert!(holder_is("com.apple.WebKit.GPU", "Safari", "safari", true));
        assert!(!holder_is("com.apple.WebKit.GPU", "Notes", "notes", false));
        assert!(!holder_is("Google Chrome", "Slack", "slack", false));
        assert!(!holder_is("anything", "", "", false));
    }
}
