Kairo is a calm focus timer that shows where your time goes, privately and on your own device. It has no account, no cloud and no analytics, and it makes no network requests unless you turn one on (site icon downloads, or the new update check).

## What's new

- **A new look.** Calm sage and mint, light cards, one dark button for the thing that matters, and far fewer words on every screen. Headers lead with the page's name; captions only appear when they have something to say. Dark mode got the same treatment.
- **Meet the new Kai.** A soft little sprout that breathes, blinks, looks around and follows your pointer with its eyes. It settles in while you focus, puts its sunglasses on for a break, is all ears while you dictate and dozes off when nothing's going on. Tap it and it squishes. The app icon is the new Kai too.
- **Home, simplified.** A greeting for the time of day, the timer, one *Today* card (focus against your goal and the last seven days at a glance), your sound, what's next and today's screen time.
- **A calmer welcome.** Two short steps instead of three.
- **Flow mode.** Turn on **Flow** on the timer (or in Settings) and focus counts up with no set end. Stop when you're done and take the break you earned: a fifth of the time you focused (40 minutes buys an 8-minute break).
- **Breathe with Kai.** On a break, tap *Breathe with Kai* for a minute of slow breathing, Kai swelling and settling with you. Turn on *Bring Kairo forward on breaks* in Settings and Kairo comes to the front when a block ends.
- **Check-ins.** After each block, Kai asks how it felt: scattered, okay or deep. One tap (or skip). You can change it later from Stats › Focus blocks, and Stats points out when your deep blocks tend to happen.
- **Kai blooms.** Reach your daily focus goal and a blossom opens on Kai's sprout, everywhere in the app, for the rest of the day.
- **Sound, fixed and rebalanced:**
  - Pressing play no longer freezes the window for a moment: sounds are now made in the background.
  - Every sound plays at the same loudness, so a preset no longer jumps in volume and the crickets in *Campfire* (and birds in *Forest Morning*) can actually be heard.
  - Loops repeat seamlessly; noise no longer dips in volume every few seconds.
  - The end-of-block chime rings out in full instead of being cut off when the break fades your sound out, and it now rings even if you never played a sound.
  - Turning off the last sound in a mix stops playback instead of leaving it stuck on "Playing".
- **Smoother:** only the countdown updates while the timer runs, not the whole Home screen.

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
