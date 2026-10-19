//! Menu-bar / system-tray presence: a live countdown and quick controls.

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

use crate::{
    models::{Phase, TimerSnapshot, TimerStatus},
    now_ms, show_main_window, timer, AppState,
};

pub struct Tray<R: Runtime> {
    icon: TrayIcon<R>,
    status: MenuItem<R>,
    toggle: MenuItem<R>,
    skip: MenuItem<R>,
    stop: MenuItem<R>,
    tracking: MenuItem<R>,
}

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, "status", "Ready to focus", false, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Start focus", true, None::<&str>)?;
    let skip = MenuItem::with_id(app, "skip", "Skip to next phase", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Reset timer", false, None::<&str>)?;
    let short = MenuItem::with_id(app, "short_break", "Take a short break", true, None::<&str>)?;
    let long = MenuItem::with_id(app, "long_break", "Take a long break", true, None::<&str>)?;
    let tracking = MenuItem::with_id(app, "tracking", "Pause tracking for 1 hour", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open Kairo", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Kairo", true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);

    let menu = Menu::with_items(
        app,
        &[
            &status, &sep()?, &toggle, &skip, &stop, &sep()?, &short, &long, &sep()?, &tracking,
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
            "open" => show_main_window(app),
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
        toggle,
        skip,
        stop,
        tracking,
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
    let show = app.state::<AppState>().settings.read().show_timer_in_tray;
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
            format!("{phase} · {time}"),
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
    let _ = tray.skip.set_enabled(true);
}

pub fn update_tracking<R: Runtime>(app: &AppHandle<R>, paused: bool) {
    if let Some(tray) = app.try_state::<Tray<R>>() {
        let _ = tray.tracking.set_text(if paused {
            "Resume tracking"
        } else {
            "Pause tracking for 1 hour"
        });
    }
}
