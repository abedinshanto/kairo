# Kairo backlog

Ideas and requests waiting for a go-ahead. Nothing here is built until it's approved.
Sizes are relative: **S** small, **M** medium, **L** large.

## Shipped in 0.4.0

From the plan below: 3 menu bar panel, 4 quick capture, 5 edit your history, 6 weekly review,
7 Tasks 2.0, 8 limits per category, 12 more sounds, 13 your data, 16 opt-in update check, and
the small issues listed at the end (except the first, which stays open). Still open: 1, 2, 9, 10
(the multilingual model and "for 45 minutes"), 11, 14, 15 and 17.

## Plan for 0.4 (proposed 2026-11-06)

### New features

1. **"Where were you?" (away time)** · M
   Coming back after 15+ minutes away, Kai asks what it was: Meeting, Break, Lunch, Offline work, or Skip. The answer is logged as time with that category, so meetings, phone calls and paper work count instead of vanishing. Threshold adjustable; off for short absences.

2. **Focus shield** · M–L · desktop
   During a focus block, switching to a distracting app or site brings up a small Kairo panel on top: "18 min left on Landing page redesign" with *Back to work*, *Allow 5 minutes* and *End block*. Opt-in; builds on Focus guard's detection.

3. **Menu bar mini-dashboard** · M · macOS, Windows
   Clicking the menu bar icon opens a small Kairo panel: the timer with start/pause/finish, tasks 1–4, today's focus ring and the app in front. The current menu stays on right-click.

4. **Quick capture from anywhere** · M · desktop
   A global shortcut opens a small floating box: say or type a task ("call the gym tomorrow") or what you're focusing on, press Enter, done. No main window needed. Uses the on-device voice engine.

5. **Edit your history** · M
   Add, edit or delete time: log a meeting Kairo couldn't see, fix a block linked to the wrong task, split or relabel a span. From the Stats timeline.

6. **Weekly review** · S–M
   Once a week (default Sunday evening), a summary like the daily one: focus trend, best day, goals hit, top apps, what pulled you away, and "plan next week" into tasks.

### Improvements to what's there

7. **Tasks 2.0** · M
   Due dates (today / tomorrow / this week, also by voice), a notes line, a "Today" view, drag-and-drop ordering instead of menu moves.

8. **Limits per category** · S–M
   e.g. Social ≤ 30 min, Entertainment ≤ 1 h a day, with a heads-up near the limit and progress in Stats. Generalises the distraction budget.

9. **Websites on Windows** · M
   Read the address from Chrome and Edge (Windows UI Automation) instead of guessing sites from window titles.

10. **Voice, round two** · S–M
    Notice a microphone plugged in later; wait for macOS's permission answer on first use; "for 45 minutes" sets the block length; optional multilingual model (downloaded only if you ask).

11. **Stats polish** · S–M
    Focus card with the same ring as Home; click an hour to zoom the timeline; this week vs last week; save a weekly report as an image or PDF.

12. **More sounds** · S–M
    Café, Train and Library soundscapes; a stop timer; a default sound per task.

13. **Your data** · S–M
    Import an export (move to a new computer or restore), automatic weekly local backups (keep the last 4), search in Settings.

### Platform and distribution (need a decision)

14. **Android updates that install over each other** · S, mostly yours
    One signing key saved as three GitHub secrets; step-by-step commands provided.

15. **macOS notarisation** · needs an Apple Developer account (99 USD/yr)
    Removes the "Open Anyway" step and makes in-app updates possible.

16. **Update check, opt-in** · S
    One request to GitHub's releases page at launch, off by default (like site icons).

17. **Other languages** · M
    Only if wanted: move the interface text into translation files.

### Known small issues

- Mid-block, the timer card can still grow when the focus wraps and a caption shows (no room beside the controls then).
- Voice availability is checked once per launch.
- First dictation on macOS can report "can't hear" if the permission prompt is still open.
- Links within the same screen (e.g. Stats ranges) don't apply until you leave and come back.
- A sound you stopped yourself during a break comes back with the next block when "Fade out during breaks" is on.
