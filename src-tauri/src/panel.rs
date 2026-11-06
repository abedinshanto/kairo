//! Two small windows beside the main one, made on first use:
//! - the menu bar panel: a glance at the timer, tasks 1–4 and today, opened by
//!   clicking the tray icon (macOS and Windows; Linux trays only offer menus);
//! - quick capture: add a task or set the focus from any app, with a global
//!   shortcut.
//!
//! Both are the same web app in a frameless window; the page reads which one it
//! is from `window.__KAIRO_WINDOW__`, and both hide as soon as they lose focus.

use std::sync::atomic::{AtomicI64, Ordering};

use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, Rect, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::now_ms;

pub const PANEL: &str = "panel";
pub const CAPTURE: &str = "capture";
const PANEL_SIZE: (f64, f64) = (360.0, 540.0);
const CAPTURE_SIZE: (f64, f64) = (580.0, 168.0);

/// When the panel last hid itself: a click on the tray icon that took focus
/// away from it closes it, and mustn't open it again straight after.
static PANEL_HIDDEN_AT: AtomicI64 = AtomicI64::new(0);

fn window<R: Runtime>(app: &AppHandle<R>, label: &str) -> tauri::Result<WebviewWindow<R>> {
    if let Some(win) = app.get_webview_window(label) {
        return Ok(win);
    }
    let (w, h) = if label == PANEL { PANEL_SIZE } else { CAPTURE_SIZE };
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Kairo")
        .initialization_script(format!("window.__KAIRO_WINDOW__ = {label:?};"))
        .inner_size(w, h)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .shadow(true);
    // Rounded corners need a see-through window; Linux draws them square.
    #[cfg(not(target_os = "linux"))]
    let builder = builder.transparent(true);
    let win = builder.build()?;
    let me = win.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Focused(false) = event {
            hide(&me);
        }
    });
    Ok(win)
}

/// Hide a small window (the page asks for this on Escape, or after adding).
pub fn hide<R: Runtime>(win: &WebviewWindow<R>) {
    if win.is_visible().unwrap_or(false) {
        if win.label() == PANEL {
            PANEL_HIDDEN_AT.store(now_ms(), Ordering::Relaxed);
        }
        let _ = win.hide();
    }
}

/// A click on the tray icon: open the panel under it, or close it if it's open.
pub fn toggle_panel<R: Runtime>(app: &AppHandle<R>, tray: Rect) {
    let Ok(win) = window(app, PANEL) else { return };
    if win.is_visible().unwrap_or(false) {
        hide(&win);
        return;
    }
    if now_ms() - PANEL_HIDDEN_AT.load(Ordering::Relaxed) < 300 {
        return;
    }
    let scale = win.scale_factor().unwrap_or(1.0);
    let icon = tray.position.to_physical::<f64>(scale);
    let icon_size = tray.size.to_physical::<f64>(scale);
    let (w, h) = (PANEL_SIZE.0 * scale, PANEL_SIZE.1 * scale);
    let centre_x = icon.x + icon_size.width / 2.0;
    let monitor = app
        .monitor_from_point(centre_x, icon.y)
        .ok()
        .flatten()
        .or_else(|| win.primary_monitor().ok().flatten());
    let mut x = centre_x - w / 2.0;
    // A menu bar at the top (macOS): just below the icon. A taskbar at the bottom (Windows): above it.
    let mut y = icon.y + icon_size.height + 6.0;
    if let Some(m) = monitor {
        let (mx, my) = (m.position().x as f64, m.position().y as f64);
        let (mw, mh) = (m.size().width as f64, m.size().height as f64);
        if icon.y > my + mh / 2.0 {
            y = icon.y - h - 6.0;
        }
        x = x.clamp(mx + 8.0, mx + mw - w - 8.0);
        y = y.clamp(my, my + mh - h);
    }
    let _ = win.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    let _ = win.show();
    let _ = win.set_focus();
    let _ = win.emit_to(PANEL, "window://shown", ());
}

/// The capture shortcut: open the box in the middle of the screen, or, if it's
/// already open, tell it (a second press starts dictation).
pub fn capture<R: Runtime>(app: &AppHandle<R>) {
    let Ok(win) = window(app, CAPTURE) else { return };
    if win.is_visible().unwrap_or(false) {
        let _ = win.set_focus();
        let _ = win.emit_to(CAPTURE, "capture://again", ());
        return;
    }
    // Upper third of the screen the pointer is on.
    if let (Ok(Some(m)), Ok(scale)) = (
        app.cursor_position().and_then(|p| app.monitor_from_point(p.x, p.y)),
        win.scale_factor(),
    ) {
        let (w, _) = (CAPTURE_SIZE.0 * scale, CAPTURE_SIZE.1 * scale);
        let x = m.position().x as f64 + (m.size().width as f64 - w) / 2.0;
        let y = m.position().y as f64 + m.size().height as f64 * 0.24;
        let _ = win.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    } else {
        let _ = win.center();
    }
    let _ = win.show();
    let _ = win.set_focus();
    let _ = win.emit_to(CAPTURE, "window://shown", ());
}
