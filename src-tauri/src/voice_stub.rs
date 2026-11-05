//! Phones and tablets have dictation on their keyboard, so Kairo's own voice
//! engine is desktop-only. These stand-ins keep the command list the same.

use tauri::AppHandle;

#[derive(Default)]
pub struct Voice;

#[tauri::command]
pub fn voice_available(_app: AppHandle) -> bool {
    false
}

#[tauri::command]
pub async fn voice_listen(_app: AppHandle) -> Result<String, String> {
    Err("Use your keyboard's dictation.".into())
}

#[tauri::command]
pub fn voice_stop(_app: AppHandle) {}

#[tauri::command]
pub fn voice_cancel(_app: AppHandle) {}
