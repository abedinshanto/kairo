Kairo is a calm focus timer that shows where your time goes, privately and on your own device. It has no account, no cloud and no analytics, and it never makes a network request.

## What's new

- **Logos instead of initials.** Well-known sites and apps show their logo: Instagram, YouTube, GitHub, Figma, Notion, Spotify and about 100 more. Other sites use the icon your browser (Chrome, Arc, Edge, Brave or Vivaldi) already saved on your computer. Nothing is downloaded.
- **Category icons** in Stats, instead of letters.
- **Tidier Settings.** Sections sit in pairs whose headings and cards line up, and settings that depend on a switch stay in place, dimmed, instead of disappearing. Where your data is stored now shows on the privacy card.
- **Sounds:** the presets line up with the player.
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
