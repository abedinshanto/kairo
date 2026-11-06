Kairo is a calm focus timer that shows where your time goes, privately and on your own device. It has no account, no cloud and no analytics, and it makes no network requests unless you turn one on (site icon downloads, or the new update check).

## What's new

- **A panel in the menu bar.** Click Kairo's icon (macOS, Windows) for the timer with start/pause/finish, your top four tasks (click one to start on it), today's focus and the app in front. The full menu moved to right-click. On Linux the icon still opens the menu.
- **Quick capture from any app.** Press **⌘/Ctrl + Alt + K**, type or say "call the gym tomorrow, one block", and press Enter. Shift+Enter makes it your focus right now instead. Press the shortcut again to talk. Change or turn off the shortcut in Settings.
- **Tasks 2.0.** Due dates (Today, Tomorrow, This week, Next week, any day, or said or typed: "…by Friday"), a **Today** tab, a one-line note, a sound per task that plays when you focus on it, and drag-and-drop ordering (or the arrow keys on the handle).
- **Edit your history.** In Stats › Your day › Timeline, click an entry to change its times or delete it, or a focus block to link it to the right task. The **+** button adds time Kairo couldn't see, like a meeting or a phone call. Added time replaces whatever was recorded then, so nothing counts twice.
- **Weekly review.** Sunday evening (or the day you pick): focus this week against the last, your best day, goal days, what pulled you away, and a quick way to put next week's tasks on Monday. It's also in Stats › 7 days.
- **Limits per category**, like "Social media, 30 minutes a day", in Settings › Goals. You get a heads-up as you get close, and Stats › Categories shows how much of each limit you've used.
- **New sounds:** Café, Train and Library, plus the presets Corner Café, Night Train and Reading Room. A **stop timer** on the Sounds player ends the sound after 15, 30 or 60 minutes, or when the block ends.
- **Your data:** **Import** a JSON export (moving to a new computer; anything already there is skipped), **weekly backups** on your computer with one-click restore (the last four are kept), and a **search box** in Settings.
- **Update check, off by default.** Turn on "Check for updates" in Settings and Kairo asks GitHub once a day whether there's a newer version. Nothing about you is sent, and nothing is downloaded or installed by itself.
- **Fixes:** the first dictation on a Mac now waits for you to answer the microphone permission prompt. A microphone you plug in later is picked up without restarting. A sound you stop yourself during a break no longer comes back with the next block. Links to a different view of the screen you're on (like Stats › 7 days) now open it.
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
