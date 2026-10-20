import { useId, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  categoryLabel,
  entityName,
  PRODUCTIVITY_LABEL,
} from "../../lib/categories";
import { fmtDuration, fmtHour, fmtTime, HOUR } from "../../lib/time";
import type { ActivitySpan, FocusSession, Productivity } from "../../lib/types";
import { ChartTooltip, FOCUS_COLOR, useSize, type TipData } from "./common";
import { COLUMN_PAD } from "./StackedColumns";

const COLOR: Record<number, string> = {
  1: "var(--productive)",
  0: "var(--neutral)",
  [-1]: "var(--distracting)",
};
const LANE_H = 34;
const FOCUS_H = 8;
const GAP = 10;
const AXIS_H = 22;

/** The hours worth drawing for a day: first to last activity, at least 8 hours wide. */
export function activeHourRange(
  spans: { start: number; end: number }[],
  day: number,
  min = 8,
): [number, number] {
  if (!spans.length) return [8, 8 + min];
  const first = Math.floor((spans[0].start - day) / HOUR);
  const last = Math.ceil((spans[spans.length - 1].end - day) / HOUR);
  let a = Math.max(0, first);
  const b = Math.min(24, Math.max(last, a + min));
  if (b - a < min) a = Math.max(0, b - min);
  return [a, b];
}

/**
 * A single day as one clean lane coloured by productivity, focus blocks as a slim
 * ink rail beneath, hours on the axis. Shares its left inset with StackedColumns so
 * an hour-by-hour chart below lines up with it.
 */
export function DayTimeline({
  day,
  spans,
  sessions,
  hours,
  labelLeft = COLUMN_PAD.left,
  axis = true,
}: {
  day: number;
  spans: ActivitySpan[];
  sessions: FocusSession[];
  hours?: [number, number];
  labelLeft?: number;
  /** Hour labels under the lanes; turn off when an hour-aligned chart below carries them. */
  axis?: boolean;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [tip, setTip] = useState<TipData | null>(null);
  /** Keyboard cursor: lane 0 = apps (each span), lane 1 = focus blocks. */
  const [kb, setKb] = useState<{ lane: 0 | 1; i: number } | null>(null);
  const clipId = `tl${useId().replace(/:/g, "")}`;
  const auto = useMemo(() => activeHourRange(spans, day), [spans, day]);
  const [h0, h1] = hours ?? auto;

  const x0 = day + h0 * HOUR;
  const span = (h1 - h0) * HOUR;
  const right = COLUMN_PAD.right;
  const plotW = Math.max(0, width - labelLeft - right);
  const x = (t: number) => labelLeft + ((t - x0) / span) * plotW;
  const height = LANE_H + GAP + FOCUS_H + (axis ? AXIS_H : 2);
  const hourW = plotW / Math.max(1, h1 - h0);
  const step = hourW < 26 ? 3 : hourW < 44 ? 2 : 1;

  // Merge back-to-back spans of the same productivity so the lane stays calm.
  const blocks = useMemo(() => {
    const out: { start: number; end: number; p: Productivity }[] = [];
    for (const s of spans) {
      const last = out[out.length - 1];
      if (last && last.p === s.productivity && s.start - last.end < 90_000)
        last.end = Math.max(last.end, s.end);
      else out.push({ start: s.start, end: s.end, p: s.productivity });
    }
    return out;
  }, [spans]);

  const focus = sessions.filter((s) => s.kind === "focus");

  const focusTip = (s: FocusSession, px: number): TipData => ({
    x: px,
    y: LANE_H + GAP - 8,
    title: s.intention || "Focus block",
    rows: [
      {
        label: s.completed ? "completed" : "ended early",
        value: fmtDuration(s.actualMs),
        color: FOCUS_COLOR,
      },
    ],
    note: `${fmtTime(s.start)} – ${fmtTime(s.end)}${s.interruptions ? ` · ${s.interruptions} detour${s.interruptions > 1 ? "s" : ""}` : ""}`,
  });

  const spanTip = (hit: ActivitySpan, px: number): TipData => ({
    x: px,
    y: -8,
    title: entityName(
      hit.domain ? "site" : "app",
      hit.domain ?? hit.appId,
      hit.appName,
    ),
    rows: [
      {
        label: `${categoryLabel(hit.category)} · ${PRODUCTIVITY_LABEL[hit.productivity]}`,
        value: fmtDuration(hit.end - hit.start),
        color: COLOR[hit.productivity],
      },
    ],
    note: `${fmtTime(hit.start)} – ${fmtTime(hit.end)}${hit.domain ? ` · in ${hit.appName}` : ""}`,
  });

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const t = x0 + ((px - labelLeft) / plotW) * span;
    setKb(null);
    if (py > LANE_H + 2) {
      const s = focus.find((f) => t >= f.start - 60_000 && t <= f.end + 60_000);
      if (s) return setTip(focusTip(s, px));
    }
    const hit =
      spans.find((s) => t >= s.start && t <= s.end) ??
      spans.find((s) => Math.abs(x(s.start) - px) < 3);
    setTip(hit ? spanTip(hit, px) : null);
  };

  // Arrow keys walk the spans (or, after ↓, the focus blocks); the tooltip follows.
  const show = (lane: 0 | 1, i: number) => {
    const item = lane === 0 ? spans[i] : focus[i];
    if (!item) return;
    const mid = x((Math.max(item.start, x0) + Math.min(item.end, x0 + span)) / 2);
    setKb({ lane, i });
    setTip(lane === 0 ? spanTip(spans[i], mid) : focusTip(focus[i], mid));
  };
  const nearest = (list: { start: number; end: number }[], t: number) => {
    let best = 0;
    list.forEach((it, k) => {
      if (Math.abs((it.start + it.end) / 2 - t) < Math.abs((list[best].start + list[best].end) / 2 - t)) best = k;
    });
    return best;
  };
  const onKey = (e: KeyboardEvent) => {
    const lane = kb?.lane ?? 0;
    const list = lane === 0 ? spans : focus;
    const i = kb?.i ?? -1;
    const at = kb ? (list[i].start + list[i].end) / 2 : x0;
    if (e.key === "ArrowRight") show(lane, Math.min(list.length - 1, i + 1));
    else if (e.key === "ArrowLeft") show(lane, i < 0 ? list.length - 1 : Math.max(0, i - 1));
    else if (e.key === "ArrowDown" && focus.length) show(1, nearest(focus, at));
    else if (e.key === "ArrowUp" && spans.length) show(0, nearest(spans, at));
    else if (e.key === "Escape") {
      setKb(null);
      setTip(null);
    } else return;
    e.preventDefault();
  };
  const clear = () => {
    setKb(null);
    setTip(null);
  };
  const kbItem = kb ? (kb.lane === 0 ? spans[kb.i] : focus[kb.i]) : null;

  const hourMarks = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i);
  const caption = "Timeline of the day's activity and focus blocks";

  return (
    <div ref={ref} className="chart timeline" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${caption}. Use the arrow keys to read each stretch; down for focus blocks.`}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={clear}
          onMouseMove={onMove}
          onMouseLeave={clear}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={labelLeft} y={0} width={plotW} height={LANE_H} rx={12} />
            </clipPath>
          </defs>
          <rect
            x={labelLeft}
            y={0}
            width={plotW}
            height={LANE_H}
            rx={12}
            className="timeline-track"
          />
          <g clipPath={`url(#${clipId})`}>
            {blocks.map((b, i) => {
              const w = x(b.end) - x(b.start);
              return (
                <rect
                  key={i}
                  x={x(b.start)}
                  y={0}
                  width={Math.max(1, w > 5 ? w - 1.5 : w)}
                  height={LANE_H}
                  fill={COLOR[b.p]}
                />
              );
            })}
            {hourMarks.slice(1, -1).map((h) => (
              <line
                key={h}
                x1={x(day + h * HOUR)}
                x2={x(day + h * HOUR)}
                y1={0}
                y2={LANE_H}
                className="timeline-hour"
              />
            ))}
          </g>
          <rect
            x={labelLeft}
            y={LANE_H + GAP}
            width={plotW}
            height={FOCUS_H}
            rx={FOCUS_H / 2}
            className="timeline-rail"
          />
          {focus.map((s) => (
            <rect
              key={s.id}
              x={x(s.start)}
              y={LANE_H + GAP}
              width={Math.max(FOCUS_H, x(s.end) - x(s.start))}
              height={FOCUS_H}
              rx={FOCUS_H / 2}
              className={
                s.completed ? "timeline-focus" : "timeline-focus partial"
              }
            />
          ))}
          {kb && kbItem && (
            <rect
              x={x(Math.max(kbItem.start, x0)) - 1}
              y={(kb.lane === 0 ? 0 : LANE_H + GAP) - 1}
              width={Math.max(kb.lane === 0 ? 3 : FOCUS_H, x(Math.min(kbItem.end, x0 + span)) - x(Math.max(kbItem.start, x0))) + 2}
              height={(kb.lane === 0 ? LANE_H : FOCUS_H) + 2}
              rx={kb.lane === 0 ? 3 : FOCUS_H / 2 + 1}
              className="timeline-hit"
            />
          )}
          {labelLeft >= 30 && (
            <>
              <text
                x={labelLeft - 10}
                y={LANE_H / 2}
                dy="0.32em"
                textAnchor="end"
                className="chart-axis"
              >
                Apps
              </text>
              <text
                x={labelLeft - 10}
                y={LANE_H + GAP + FOCUS_H / 2}
                dy="0.32em"
                textAnchor="end"
                className="chart-axis"
              >
                Focus
              </text>
            </>
          )}
          {axis &&
            hourMarks
              .filter((h) => (h - h0) % step === 0 && h < h1)
              .map((h) => (
                <text
                  key={h}
                  x={x(day + h * HOUR) + hourW / 2}
                  y={height - 5}
                  textAnchor="middle"
                  className="chart-axis"
                >
                  {fmtHour(h % 24)}
                </text>
              ))}
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
      {/* A table can't shrink to the 1px sr-only box, so the wrapper carries the class. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <tbody>
            {blocks.map((b, i) => (
              <tr key={i}>
                <th>{`${fmtTime(b.start)} – ${fmtTime(b.end)}`}</th>
                <td>{PRODUCTIVITY_LABEL[b.p]}</td>
              </tr>
            ))}
            {focus.map((s) => (
              <tr key={`f${s.id}`}>
                <th>{`${fmtTime(s.start)} – ${fmtTime(s.end)}`}</th>
                <td>{`Focus block: ${s.intention || "untitled"}, ${s.completed ? "completed" : "ended early"}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
