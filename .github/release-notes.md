Kairo is a calm focus timer that shows where your time goes, privately and on your own device. It has no account, no cloud and no analytics, and it makes no network requests unless you turn on site icon downloads.

## What's new

- **A stream that sounds like a stream.** Forest Morning's brook used to swell and fade like someone breathing into a microphone. It's now a steady rush of water full of small bubbling plinks, and the birdsong sits a little in front of it.
- **Focus time on Stats is a proper card** in light mode, like the Distracting card next to it, instead of fading into the background. Other tinted cards (Settings' privacy card, Home tips) stand out from the page too.
- **Your sound comes back after a break.** With "Fade out during breaks" on, a soundscape you were playing now returns when the next focus block starts, even if "Play when a focus block starts" is off.
- **Type a task's name as your focus** and Kairo links that task, so the block counts toward it.
- **Kairo counts as planning** in your stats (Planning & tools) instead of "Other".
- **Smoother settings.** Dragging a slider (volume, mixer) no longer jumps back for a moment while earlier changes save.
- **Lighter on your disk.** Looking for site icons now copies a browser's icon database only when the browser has changed it.
- **Android:** if Android won't install this over your current version, export your data from **Settings** (Export on the privacy card) if you want a copy, uninstall the old app, then install this one.

## Downloads

| Platform | File |
| --- | --- |
| **macOS** (Apple silicon, M1 and later) | `Kairo_*_aarch64.dmg` |
| **macOS** (Intel) | `Kairo_*_x64.dmg` |
| **Windows** 10/11 | `Kairo_*_x64-setup.exe` (or the `.msi`) |
| **Linux** | `Kairo_*_amd64.AppImage`, `.deb` (Debian/Ubuntu) or `.rpm` (Fedora) |
| **Android** 7+ | `Kairo_*_android_arm64.apk` |

`SHA256SUMS.txt` lists a checksum for every file.

## First launch

These builds are not signed with paid developer certificates yet, so each system asks you to confirm once.

- **macOS:** open the `.dmg` and drag Kairo to Applications. If macOS says it can't verify the app, open **System Settings → Privacy & Security** and click **Open Anyway**.
- **Windows:** if SmartScreen appears, click **More info → Run anyway**.
- **Linux:** make the AppImage executable (`chmod +x Kairo_*.AppImage`) and run it, or install the `.deb` / `.rpm`. App tracking works on X11; Wayland doesn't expose the focused window to apps.
- **Android:** allow your browser or file manager to install unknown apps, then open the APK. To track app usage, Kairo asks for **Usage access** during setup.
- **iPhone and iPad:** not included. Apple only allows installs through the App Store or TestFlight, which needs an Apple Developer account. The iOS build is checked in CI.
