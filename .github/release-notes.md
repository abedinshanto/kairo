Kairo is a calm focus timer that shows where your time goes, privately and on your own device. It has no account, no cloud and no analytics, and it makes no network requests unless you turn on site icon downloads.

## What's new

- **Watching counts.** A long video or a call no longer stops counting after a few minutes without keyboard or mouse input. Kairo now keeps counting while the app in front is playing video or holding a call, so a three-hour film is three hours, not the minutes after you last touched the mouse.
- **Exclude any app or site from Stats.** Tap a row in **Top apps & sites** (or in Apps & sites) and choose **Exclude & delete history**. Websites can be excluded now too. Kairo deletes their history and stops recording them; **Settings → Excluded apps & sites** brings any of them back.
- **More site icons.** Kairo now looks up icons for every site in your history, not just ones you visit after updating, and tries again when one is missing. Small icons show on a neat tile instead of being stretched.
- **Download site icons** (Settings → Appearance & system, off by default). For sites your browser has no saved icon for (ChatGPT, for example), Kairo can ask the site itself. It asks only that site, over HTTPS, sends nothing about you, and it's the only time Kairo goes online.
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
