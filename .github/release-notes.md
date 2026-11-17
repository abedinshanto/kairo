Kairo is a calm focus timer that shows where your time goes, privately and on your own device. It has no account, no cloud and no analytics, and it makes no network requests unless you turn one on (site icon downloads, or the new update check).

## What's new

- **A sidebar on wide windows.** Every screen, a search box and a live mini timer are always in reach; Settings sits apart at the bottom. Medium windows get a slim rail, phones a tab bar, and every item now shows its name.
- **Command palette.** Press **⌘/Ctrl + K** anywhere: start, pause or finish a block, switch modes, focus on a task, jump to a screen, play a soundscape or change the theme, without touching the mouse.
- **Undo.** Finished a task by mistake? The toast has an **Undo** button. Toasts also wait while you hover or focus them.
- **Easier to use with a keyboard, a screen reader or a finger:** a *Skip to content* link, focus moves to the title of each new screen, nothing is hidden behind the tab bar, and every control is at least 44 points on touch screens.
- **One rhythm for motion and spacing** across the app (shared type, spacing, timing and layering scales), checked against the UI UX Pro Max rule set and an automated accessibility audit with no remaining issues.

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
