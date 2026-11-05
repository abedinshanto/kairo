Kairo is a calm focus timer that shows where your time goes, privately and on your own device. It has no account, no cloud and no analytics, and it makes no network requests unless you turn on site icon downloads.

## What's new

- **Tell Kai what you're working on.** Tap Kai on the timer (or press **V**), say it, and pause: the words become your focus. Say a task's name, or "task two", and Kai links that task. It runs entirely on your computer with Whisper, OpenAI's open speech model, in its small English version, which ships with the app. Your voice is never recorded or sent anywhere.
- **Dictate tasks.** The microphone in **Add a task** takes things like "landing page redesign, three blocks" and fills in the estimate too.
- **Tasks 1 to 4 on the timer.** The link button is now four number buttons (and the keys **1–4**) for your top four tasks. Home's Up next list shows the same numbers.
- **Put tasks in order.** Move any task up, down or to the top from its menu; new tasks start at the top.
- **Add as task.** When your focus isn't a task yet, one tap turns it into one, linked to the timer.
- The desktop downloads are about 32 MB bigger because the speech model comes with them. The first time you dictate, your computer asks to use the microphone.
- **Android:** voice uses your keyboard's own dictation. If Android won't install this over your current version, export your data from **Settings** (Export on the privacy card) if you want a copy, uninstall the old app, then install this one.

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
