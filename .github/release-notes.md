Kairo is a calm focus timer that shows where your time goes, privately and on your own device. It has no account, no cloud and no analytics, and it makes no network requests unless you turn on site icon downloads.

## What's new

- **A steadier timer card.** A focus that wraps onto two lines no longer makes the card, and everything next to it, taller. Before a block starts, the hint and **Add as task** sit beside the play button, where there's room.
- **New Focused today and Goal streak cards.** A ring fills up toward your daily goal, and a seven-day ring lights up each day you reached it. Both cards now match the rest of Home in light mode.
- **Delete history without excluding.** In an app's or site's details (tap it in Stats or Apps & sites), **Delete history** removes its recorded time once. Kairo keeps tracking it, and it shows up again next time you use it. **Exclude & delete** still stops tracking it for good.
- **A nicer menu bar menu**, with icons, a coloured dot for the timer's state, and the length of each break.
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
