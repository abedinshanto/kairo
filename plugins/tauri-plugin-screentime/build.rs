// The plugin exposes no JS commands: the host app calls it from Rust and
// stores results in its own on-device database.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
