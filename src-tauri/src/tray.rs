//! Menu-bar / system-tray presence: a live countdown and quick controls.

use tauri::{
    image::Image,
    menu::{IconMenuItem, Menu, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

use crate::{
    models::{Phase, TimerSnapshot, TimerStatus},
    now_ms, show_main_window, timer, AppState,
};

/// Menu icons: Lucide outlines in a neutral grey that reads in light and dark
/// menus (18 pt, drawn at 2x), and a coloured dot for the timer's state.
mod icon {
    pub const CHART: &[u8] = include_bytes!("../icons/menu/chart.png");
    pub const PLAY: &[u8] = include_bytes!("../icons/menu/play.png");
    pub const PAUSE: &[u8] = include_bytes!("../icons/menu/pause.png");
    pub const CHECK: &[u8] = include_bytes!("../icons/menu/check.png");
    pub const SKIP: &[u8] = include_bytes!("../icons/menu/skip.png");
    pub const RESET: &[u8] = include_bytes!("../icons/menu/reset.png");
    pub const COFFEE: &[u8] = include_bytes!("../icons/menu/coffee.png");
    pub const SOFA: &[u8] = include_bytes!("../icons/menu/sofa.png");
    pub const EYE: &[u8] = include_bytes!("../icons/menu/eye.png");
    pub const EYE_OFF: &[u8] = include_bytes!("../icons/menu/eye-off.png");
    pub const OPEN: &[u8] = include_bytes!("../icons/menu/open.png");
    pub const QUIT: &[u8] = include_bytes!("../icons/menu/quit.png");
    pub const DOT_FOCUS: &[u8] = include_bytes!("../icons/menu/dot-focus.png");
    pub const DOT_BREAK: &[u8] = include_bytes!("../icons/menu/dot-break.png");
    pub const DOT_PAUSED: &[u8] = include_bytes!("../icons/menu/dot-paused.png");
    pub const DOT_IDLE: &[u8] = include_bytes!("../icons/menu/dot-idle.png");
}

fn image(bytes: &'static [u8]) -> Option<Image<'static>> {
    Image::from_bytes(bytes).ok()
}

pub struct Tray<R: Runtime> {
    icon: TrayIcon<R>,
    status: IconMenuItem<R>,
    today: IconMenuItem<R>,
    toggle: IconMenuItem<R>,
    finish: IconMenuItem<R>,
    skip: IconMenuItem<R>,
    stop: IconMenuItem<R>,
    short: IconMenuItem<R>,
    long: IconMenuItem<R>,
    tracking: IconMenuItem<R>,
    /// The state the icons were last drawn for (they only change with it).
    shown: parking_lot::Mutex<Option<(u8, u8, u32, u32)>>,
}

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let item = |id: &str, text: &str, enabled: bool, bytes: &'static [u8]| {
        IconMenuItem::with_id(app, id, text, enabled, image(bytes), None::<&str>)
    };
    let status = item("status", "Ready to focus", false, icon::DOT_IDLE)?;
    let today = item("today", "Today · nothing tracked yet", true, icon::CHART)?;
    let toggle = item("toggle", "Start focus", true, icon::PLAY)?;
    let finish = item("finish", "Finish and log this block", false, icon::CHECK)?;
    let skip = item("skip", "Skip to break", true, icon::SKIP)?;
    let stop = item("stop", "Start over", false, icon::RESET)?;
    let short = item("short_break", "Short break", true, icon::COFFEE)?;
    let long = item("long_break", "Long break", true, icon::SOFA)?;
    let tracking = item("tracking", "Pause tracking for an hour", true, icon::EYE_OFF)?;
    let open = item("open", "Open Kairo", true, icon::OPEN)?;
    let quit = item("quit", "Quit Kairo", true, icon::QUIT)?;
    let sep = || PredefinedMenuItem::separator(app);

    let menu = Menu::with_items(
        app,
        &[
            &status, &today, &sep()?, &toggle, &finish, &skip, &stop, &sep()?, &short, &long,
            &sep()?, &tracking,
            &sep()?, &open, &quit,
        ],
    )?;
    let icon = TrayIconBuilder::with_id("kairo")
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .icon_as_template(true)
        .tooltip("Kairo")
        .menu(&menu)
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => {
                timer::perform(app, timer::Action::Toggle);
            }
            "finish" => {
                timer::perform(app, timer::Action::Finish);
            }
            "skip" => {
                timer::perform(app, timer::Action::Skip);
            }
            "stop" => {
                timer::perform(app, timer::Action::Stop);
            }
            "short_break" => {
                timer::set_phase(app, Phase::ShortBreak);
                timer::perform(app, timer::Action::Start);
            }
            "long_break" => {
                timer::set_phase(app, Phase::LongBreak);
                timer::perform(app, timer::Action::Start);
            }
            "tracking" => {
                let paused = app
                    .state::<AppState>()
                    .tracker
                    .lock()
                    .paused_until
                    .is_some_and(|t| t > now_ms());
                crate::commands::set_tracking_pause(app, if paused { None } else { Some(60) });
            }
            "open" | "today" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if !cfg!(target_os = "macos") {
                    show_main_window(tray.app_handle());
                }
            }
        })
        .build(app)?;

    app.manage(Tray {
        icon,
        status,
        today,
        toggle,
        finish,
        skip,
        stop,
        short,
        long,
        tracking,
        shown: parking_lot::Mutex::new(None),
    });
    Ok(())
}

fn clock(ms: i64) -> String {
    let secs = (ms + 999) / 1000;
    let (h, m, s) = (secs / 3600, (secs % 3600) / 60, secs % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

pub fn update_timer<R: Runtime>(app: &AppHandle<R>, snap: &TimerSnapshot) {
    let Some(tray) = app.try_state::<Tray<R>>() else {
        return;
    };
    let (show, short_min, long_min) = {
        let s = app.state::<AppState>().settings.read().clone();
        (s.show_timer_in_tray, s.short_break_minutes, s.long_break_minutes)
    };
    let time = clock(snap.remaining_ms);
    let phase = snap.phase.label();

    let (title, status, toggle) = match snap.status {
        TimerStatus::Running => (
            Some(time.clone()),
            format!("{phase} · {time} left"),
            "Pause",
        ),
        TimerStatus::Paused => (
            Some(format!("❚❚ {time}")),
            format!("{phase} paused · {time} left"),
            "Resume",
        ),
        TimerStatus::Idle => (
            None,
            match snap.phase {
                Phase::Focus => format!("Ready to focus · {time}"),
                _ => format!("{phase} · {time}"),
            },
            match snap.phase {
                Phase::Focus => "Start focus",
                _ => "Start break",
            },
        ),
    };
    let _ = tray.icon.set_title(if show { title.as_deref() } else { None });
    let _ = tray.icon.set_tooltip(Some(format!("Kairo — {status}")));
    let _ = tray.status.set_text(status);
    let _ = tray.toggle.set_text(toggle);
    let _ = tray.stop.set_enabled(snap.started_at.is_some());
    // A focus block under way is finished (and logged), never skipped.
    let focus_started = snap.phase == Phase::Focus && snap.started_at.is_some();
    let _ = tray.finish.set_enabled(focus_started);
    let _ = tray.skip.set_enabled(!focus_started);
    let _ = tray.skip.set_text(match snap.phase {
        Phase::Focus => "Skip to break",
        _ => "Skip break",
    });

    // Icons and break lengths only change with the state; images aren't redrawn every tick.
    let status_key = match snap.status {
        TimerStatus::Running => 0,
        TimerStatus::Paused => 1,
        TimerStatus::Idle => 2,
    };
    let phase_key = match snap.phase {
        Phase::Focus => 0,
        Phase::ShortBreak => 1,
        Phase::LongBreak => 2,
    };
    let key = (status_key, phase_key, short_min, long_min);
    let mut shown = tray.shown.lock();
    if *shown == Some(key) {
        return;
    }
    *shown = Some(key);
    let dot = match (snap.status, snap.phase) {
        (TimerStatus::Paused, _) => icon::DOT_PAUSED,
        (TimerStatus::Running, Phase::Focus) => icon::DOT_FOCUS,
        (TimerStatus::Running, _) => icon::DOT_BREAK,
        (TimerStatus::Idle, _) => icon::DOT_IDLE,
    };
    let _ = tray.status.set_icon(image(dot));
    let running = matches!(snap.status, TimerStatus::Running);
    let _ = tray.toggle.set_icon(image(if running { icon::PAUSE } else { icon::PLAY }));
    let _ = tray.short.set_text(format!("Short break · {short_min} min"));
    let _ = tray.long.set_text(format!("Long break · {long_min} min"));
}

/// The day at a glance in the menu: "Today 5h 12m · 74% productive · focus 1h 40m".
pub fn update_today<R: Runtime>(app: &AppHandle<R>, text: &str) {
    if let Some(tray) = app.try_state::<Tray<R>>() {
        let _ = tray.today.set_text(text);
    }
}

pub fn update_tracking<R: Runtime>(app: &AppHandle<R>, paused: bool) {
    if let Some(tray) = app.try_state::<Tray<R>>() {
        let _ = tray.tracking.set_text(if paused {
            "Resume tracking"
        } else {
            "Pause tracking for an hour"
        });
        let _ = tray.tracking.set_icon(image(if paused { icon::EYE } else { icon::EYE_OFF }));
    }
}
