import { useId, useMemo, useState, type MouseEvent } from "react";
import { categoryLabel, entityName, PRODUCTIVITY_LABEL } from "../../lib/categories";
import { fmtDuration, fmtHour, fmtTime, HOUR } from "../../lib/time";
import type { ActivitySpan, FocusSession, Productivity } from "../../lib/types";
import { ChartTooltip, useSize, type TipData } from "./common";

const COLOR: Record<number, string> = { 1: "var(--productive)", 0: "var(--neutral)", [-1]: "var(--distracting)" };
const LANE_H = 30;
const FOCUS_H = 12;
const GAP = 10;
const AXIS_H = 20;
const LABEL_W = 52;

/** A single day: activity coloured by productivity, focus sessions beneath, hours on the axis. */
export function DayTimeline({ day, spans, sessions }: { day: number; spans: ActivitySpan[]; sessions: FocusSession[] }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [tip, setTip] = useState<TipData | null>(null);
  const clipId = `tl${useId().replace(/:/g, "")}`;

  const [h0, h1] = useMemo(() => {
    if (!spans.length) return [8, 20];
    const first = Math.floor((spans[0].start - day) / HOUR);
    const last = Math.ceil((spans[spans.length - 1].end - day) / HOUR);
    let a = Math.max(0, first);
    let b = Math.min(24, Math.max(last, a + 8));
    if (b - a < 8) a = Math.max(0, b - 8);
    if (b - a > 16) b = Math.min(24, b);
    return [a, b];
  }, [spans, day]);

  const x0 = day + h0 * HOUR;
  const span = (h1 - h0) * HOUR;
  const plotW = Math.max(0, width - LABEL_W);
  const x = (t: number) => LABEL_W + ((t - x0) / span) * plotW;
  const height = LANE_H + GAP + FOCUS_H + AXIS_H + 6;
  const step = width < 520 ? 4 : width < 760 ? 3 : 2;

  // Merge back-to-back spans of the same productivity so the strip stays crisp.
  const blocks = useMemo(() => {
    const out: { start: number; end: number; p: Productivity; items: ActivitySpan[] }[] = [];
    for (const s of spans) {
      const last = out[out.length - 1];
      if (last && last.p === s.productivity && s.start - last.end < 60_000) {
        last.end = s.end;
        last.items.push(s);
      } else out.push({ start: s.start, end: s.end, p: s.productivity, items: [s] });
    }
    return out;
  }, [spans]);

  const focus = sessions.filter((s) => s.kind === "focus");

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const t = x0 + ((px - LABEL_W) / plotW) * span;
    if (py > LANE_H + GAP - 4 && py < LANE_H + GAP + FOCUS_H + 4) {
      const s = focus.find((f) => t >= f.start && t <= f.end);
      if (s) {
        setTip({
          x: px,
          y: LANE_H + GAP - 6,
          title: s.intention || "Focus session",
          rows: [{ label: s.completed ? "completed" : "ended early", value: fmtDuration(s.actualMs), color: "var(--phase-focus)" }],
          note: `${fmtTime(s.start)} – ${fmtTime(s.end)}${s.interruptions ? ` · ${s.interruptions} detour${s.interruptions > 1 ? "s" : ""}` : ""}`,
        });
        return;
      }
    }
    const hit = spans.find((s) => t >= s.start && t <= s.end) ?? spans.find((s) => Math.abs(x(s.start) - px) < 3);
    if (!hit) return setTip(null);
    setTip({
      x: px,
      y: -6,
      title: entityName(hit.domain ? "site" : "app", hit.domain ?? hit.appId, hit.appName),
      rows: [{ label: `${categoryLabel(hit.category)} · ${PRODUCTIVITY_LABEL[hit.productivity]}`, value: fmtDuration(hit.end - hit.start), color: COLOR[hit.productivity] }],
      note: `${fmtTime(hit.start)} – ${fmtTime(hit.end)}${hit.domain ? ` · in ${hit.appName}` : ""}`,
    });
  };

  return (
    <div ref={ref} className="chart timeline" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Timeline of today's activity and focus sessions" onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
          <defs>
            <clipPath id={clipId}>
              <rect x={LABEL_W} y={0} width={plotW} height={LANE_H} rx={7} />
            </clipPath>
          </defs>
          <rect x={LABEL_W} y={0} width={plotW} height={LANE_H} rx={7} className="timeline-track" />
          {Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i).map((h) => (
            <line key={h} x1={x(day + h * HOUR)} x2={x(day + h * HOUR)} y1={0} y2={LANE_H + GAP + FOCUS_H} className="chart-grid" />
          ))}
          <g clipPath={`url(#${clipId})`}>
            {blocks.map((b, i) => (
              <rect key={i} x={x(b.start)} y={0} width={Math.max(1, x(b.end) - x(b.start) - 1)} height={LANE_H} fill={COLOR[b.p]} />
            ))}
          </g>
          <rect x={LABEL_W} y={LANE_H + GAP} width={plotW} height={FOCUS_H} rx={4} className="timeline-track" />
          {focus.map((s) => (
            <rect
              key={s.id}
              x={x(s.start)}
              y={LANE_H + GAP}
              width={Math.max(3, x(s.end) - x(s.start))}
              height={FOCUS_H}
              rx={4}
              className={s.completed ? "timeline-focus" : "timeline-focus partial"}
            />
          ))}
          <text x={0} y={LANE_H / 2} dy="0.32em" className="chart-axis">
            Apps
          </text>
          <text x={0} y={LANE_H + GAP + FOCUS_H / 2} dy="0.32em" className="chart-axis">
            Focus
          </text>
          {Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i)
            .filter((h) => (h - h0) % step === 0)
            .map((h) => (
              <text key={h} x={x(day + h * HOUR)} y={height - 4} textAnchor={h === h0 ? "start" : h === h1 ? "end" : "middle"} className="chart-axis">
                {fmtHour(h % 24)}
              </text>
            ))}
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
    </div>
  );
}
