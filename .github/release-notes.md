Kairo is a calm focus timer that shows where your time goes, privately and on your own device. It has no account, no cloud and no analytics, and it never makes a network request.

## What's new

- **Finish early.** Done before the timer? Press **Finish** (or S): the time so far is logged as a finished block, credited to its task, and your break starts.
- **Daily summary.** At a time you choose (6 pm by default), Kairo sums up your day: screen time, focus against your goal, tasks done, your sharpest hour, and what pulled you away. Click the notification or open it from Home or Stats.
- **Whole-day tracking.** Kairo can open at login and sit quietly in the menu bar, so it sees your whole day. On macOS it can also see which websites you visit (macOS asks once per browser; only the domain is kept).
- **Real app icons** next to app names, read from the apps on your computer.
- **Screen time on Home**, a calmer layout where every column lines up, and no more stacked cards behind the timer.
- **Drag the window** from the top edge on macOS.
- The menu bar shows today at a glance, and Kairo lets you know once when your distraction budget is used up.
- **Android:** this build is signed with a new key, so it won't install over an earlier version. Export your data in **Settings → Privacy & data** if you want a copy, uninstall the old app, then install this one.

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
