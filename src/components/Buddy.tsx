import { useId } from "react";
import { cx } from "./ui";

export type BuddyMood = "idle" | "focus" | "break" | "paused" | "happy" | "sleep";
export type BuddyTone = "blue" | "mint" | "violet" | "cloud";

type Palette = {
  /** key light (top-left) */
  hi: string;
  /** body base */
  mid: string;
  /** shadow side */
  lo: string;
  /** core / occlusion shadow */
  deep: string;
  /** bounce rim along the lower-right edge */
  rim: string;
  /** inner ear */
  ear: string;
  /** sleep z's */
  zz: string;
  blush: string;
};

const INK = "#121a46";
const TONGUE = "#ff7f9f";

const TONES: Record<BuddyTone, Palette> = {
  blue: { hi: "#8aacff", mid: "#4e7cff", lo: "#2b5cf0", deep: "#1a3db8", rim: "#b8ccff", ear: "#3557e4", zz: "#3a6af8", blush: "#ff86a8" },
  mint: { hi: "#b6f2db", mid: "#43d2a2", lo: "#17a67c", deep: "#0a7656", rim: "#cdf8e9", ear: "#1c9f78", zz: "#17a67c", blush: "#ff86a8" },
  violet: { hi: "#d8cbff", mid: "#9f82ff", lo: "#7151f0", deep: "#4b2cc4", rim: "#e5dcff", ear: "#6a47e6", zz: "#7151f0", blush: "#ff86b0" },
  cloud: { hi: "#ffffff", mid: "#f7f9ff", lo: "#d8e2fc", deep: "#9fb5ee", rim: "#ffffff", ear: "#ffc6d6", zz: "#ffffff", blush: "#ff9fbb" },
};

/** Bean silhouette: softly tapered crown, plump rounded base (taller than wide). */
const BODY =
  "M60 19C64.3 19 69 20 72.8 21.9C76.6 23.8 79.9 26.8 82.8 30.3C85.8 33.9 88.5 38.3 90.5 43.4C92.6 48.4 94.3 54.8 95 60.5C95.8 66.2 95.9 72.6 94.8 77.6C93.8 82.7 91.8 87.1 88.8 90.7C85.9 94.2 82.1 97.2 77.3 99.1C72.5 101 65.8 102 60 102C54.2 102 47.5 101 42.7 99.1C37.9 97.2 34.1 94.2 31.2 90.7C28.2 87.1 26.2 82.7 25.2 77.6C24.1 72.6 24.2 66.2 25 60.5C25.7 54.8 27.4 48.4 29.5 43.4C31.5 38.3 34.2 33.9 37.2 30.3C40.1 26.8 43.4 23.8 47.2 21.9C51 20 55.7 19 60 19Z";

/** Open-mouth smile (happy). */
const GRIN = "M52.5 72Q60 73.4 67.5 72Q66.6 82 60 82Q53.4 82 52.5 72Z";

const EYE_Y = 64;
const EYES = [44, 76];

/** Ear body language per mood: extra outward tilt in degrees (negative = perked up) and lift. */
const EARS: Record<BuddyMood, { l: number; r: number; lift: number }> = {
  idle: { l: 0, r: 0, lift: 0 },
  focus: { l: -6, r: -6, lift: 0.8 },
  break: { l: 10, r: 10, lift: -0.4 },
  paused: { l: 14, r: -6, lift: 0 },
  happy: { l: -10, r: -10, lift: 1.6 },
  sleep: { l: 26, r: 26, lift: -1.4 },
};

const line = { stroke: INK, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

/**
 * Kai — Kairo's little focus buddy: a plump clay bean with two soft bear-cub ears
 * and stubby feet. The face follows the timer (curious when idle, calm half-moon
 * eyes while focusing, blissful on breaks) and the ears add body language:
 * perked when happy or focused, drooping when asleep.
 */
export function Buddy({ mood = "idle", tone = "blue", size = 96, still = false, label }: { mood?: BuddyMood; tone?: BuddyTone; size?: number; still?: boolean; label?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const c = TONES[tone];
  const u = (k: string) => `url(#${k}${id})`;
  const ear = EARS[mood];
  const blush = mood === "happy" || mood === "break" ? 1 : mood === "focus" ? 0.7 : 0.85;

  /**
   * Ears are molded from the same clay as the body: plain circles in absolute
   * coordinates (no transform), so the body gradient continues across them with
   * no seam. They sit behind the body; the head cuts the deeper inner tint into
   * a soft "C". Tilt per mood comes from EARS.
   */
  const earAt = (dir: -1 | 1, d: number, r: number) => {
    const a = (dir * (36 + ear[dir < 0 ? "l" : "r"]) * Math.PI) / 180;
    return <circle key={dir} cx={(60 + dir * 18 + d * Math.sin(a)).toFixed(2)} cy={(29 - ear.lift - d * Math.cos(a)).toFixed(2)} r={r} />;
  };
  const earOuter = (dir: -1 | 1) => earAt(dir, 5.6, 8.2);
  const earInner = (dir: -1 | 1) => earAt(dir, 4.4, 4.6);

  /** Solid ink eye with a crisp key catchlight and a small bounce glint. */
  const openEye = (x: number, y: number, rx: number, ry: number, glint = true) => (
    <g key={x}>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={INK} />
      <circle cx={x - rx * 0.34} cy={y - ry * 0.38} r={rx * 0.36} fill="#fff" />
      {glint && <circle cx={x + rx * 0.4} cy={y + ry * 0.4} r={rx * 0.16} fill="#fff" opacity="0.85" />}
    </g>
  );

  /** Content, steady half-moon eye: a dome whose lower edge lifts in a soft curve. */
  const focusEye = (x: number, y: number, rx: number, ry: number) => (
    <g key={x}>
      <path d={`M${x - rx} ${y + 1.6}A${rx} ${ry} 0 0 1 ${x + rx} ${y + 1.6}Q${x} ${y - 0.6} ${x - rx} ${y + 1.6}Z`} fill={INK} />
      <circle cx={x - rx * 0.32} cy={y - ry * 0.42} r={rx * 0.3} fill="#fff" />
    </g>
  );

  let eyes;
  let eyeY = EYE_Y;
  if (mood === "idle") eyes = EYES.map((x) => openEye(x, EYE_Y, 6.4, 7.6));
  // focus: calm, steady gaze lowered onto the work
  else if (mood === "focus") eyes = EYES.map((x) => focusEye(x, (eyeY = EYE_Y + 1), 6.4, 7.4));
  // paused: glancing aside, waiting
  else if (mood === "paused") eyes = EYES.map((x) => openEye(x - 2.8, (eyeY = EYE_Y - 1.2), 6.4, 7.6));

  return (
    <span className={cx("buddy", `mood-${mood}`, still && "still")} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <defs>
          <radialGradient id={`body${id}`} gradientUnits="userSpaceOnUse" cx="46" cy="36" r="78" fx="43" fy="31">
            <stop offset="0" stopColor={c.hi} />
            <stop offset="0.48" stopColor={c.mid} />
            <stop offset="1" stopColor={c.lo} />
          </radialGradient>
          <radialGradient id={`core${id}`} gradientUnits="userSpaceOnUse" cx="68" cy="112" r="54">
            <stop offset="0" stopColor={c.deep} stopOpacity="0.6" />
            <stop offset="0.5" stopColor={c.deep} stopOpacity="0.22" />
            <stop offset="1" stopColor={c.deep} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`bloom${id}`} gradientUnits="userSpaceOnUse" cx="45" cy="36" r="26">
            <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`rim${id}`} gradientUnits="userSpaceOnUse" x1="90" y1="98" x2="70" y2="64">
            <stop offset="0" stopColor={c.rim} stopOpacity="0.45" />
            <stop offset="1" stopColor={c.rim} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`foot${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.lo} />
            <stop offset="0.55" stopColor={c.mid} />
            <stop offset="1" stopColor={c.lo} />
          </linearGradient>
          <radialGradient id={`blush${id}`}>
            <stop offset="0" stopColor={c.blush} stopOpacity="0.9" />
            <stop offset="0.55" stopColor={c.blush} stopOpacity="0.5" />
            <stop offset="1" stopColor={c.blush} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`ground${id}`}>
            <stop offset="0" stopColor={c.deep} stopOpacity="0.26" />
            <stop offset="1" stopColor={c.deep} stopOpacity="0" />
          </radialGradient>
          <clipPath id={`clip${id}`}>
            <path d={BODY} />
            {earOuter(-1)}
            {earOuter(1)}
          </clipPath>
          <mask id={`rimMask${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
            <path d={BODY} fill="#fff" />
            <path d={BODY} fill="#000" transform="translate(-1.3 -1.8)" />
          </mask>
          <clipPath id={`grin${id}`}>
            <path d={GRIN} />
          </clipPath>
        </defs>

        {/* ground shadow */}
        <ellipse cx="60" cy="107" rx="29" ry="4.4" fill={u("ground")} />

        <g className="buddy-float">
          {/* standing on the ground line (y 104), scaled up a touch to fill the avatar circle */}
          <g transform={`translate(60 104) scale(1.06)${mood === "paused" ? " rotate(-4)" : mood === "sleep" ? " rotate(-5)" : ""} translate(-60 -104)`}>
            {/* ears + feet tuck behind the body */}
            <g fill={u("body")}>
              {earOuter(-1)}
              {earOuter(1)}
            </g>
            <g fill={c.ear}>
              {earInner(-1)}
              {earInner(1)}
            </g>
            <ellipse cx="47.5" cy="100.6" rx="7.2" ry="4.4" fill={u("foot")} />
            <ellipse cx="72.5" cy="100.6" rx="7.2" ry="4.4" fill={u("foot")} />

            {/* body: base, core shadow + soft key light, rim, specular */}
            <path d={BODY} fill={u("body")} />
            <g clipPath={u("clip")}>
              <rect width="120" height="120" fill={u("core")} />
              <rect width="120" height="120" fill={u("bloom")} />
            </g>
            <path d={BODY} fill={u("rim")} mask={u("rimMask")} />
            <ellipse cx="45" cy="32" rx="4" ry="2.2" fill="#fff" opacity="0.7" transform="rotate(-36 45 32)" />

            {/* cheeks */}
            <ellipse cx="33.5" cy="75" rx="8" ry="5" fill={u("blush")} opacity={blush} />
            <ellipse cx="86.5" cy="75" rx="8" ry="5" fill={u("blush")} opacity={blush} />

            {/* eyes: only open eyes blink */}
            {eyes ? (
              <g className="buddy-eyes" style={{ transformOrigin: `60px ${eyeY}px` }}>
                {eyes}
              </g>
            ) : (
              <g {...line} strokeWidth="3.3">
                {EYES.map((x) =>
                  mood === "happy" ? (
                    <path key={x} d={`M${x - 5.5} ${EYE_Y + 2}q5.5-7.5 11 0`} />
                  ) : mood === "break" ? (
                    <path key={x} d={`M${x - 5.5} ${EYE_Y - 1}q5.5 6 11 0`} />
                  ) : (
                    <path key={x} d={`M${x - 5.2} ${EYE_Y + 1}q5.2 3.6 10.4 0`} />
                  ),
                )}
              </g>
            )}

            {/* mouth */}
            {mood === "happy" ? (
              <g>
                <path d={GRIN} fill={INK} />
                <ellipse cx="60" cy="82" rx="5" ry="3.6" fill={TONGUE} clipPath={u("grin")} />
              </g>
            ) : mood === "paused" ? (
              <ellipse cx="58" cy="75" rx="2.5" ry="2.9" fill={INK} />
            ) : mood === "break" ? (
              <path d="M54 73q6 5.6 12 0" {...line} strokeWidth="2.8" />
            ) : mood === "sleep" ? (
              <path d="M57 74.5q3 2.4 6 0" {...line} strokeWidth="2.6" />
            ) : mood === "focus" ? (
              <path d="M56.5 74.5q3.5 2.8 7 0" {...line} strokeWidth="2.6" />
            ) : (
              <path d="M55 73q5 4.8 10 0" {...line} strokeWidth="2.8" />
            )}
          </g>

          {mood === "sleep" && (
            <g {...line} stroke={c.zz}>
              <path d="M97 32h7l-7 8h7" strokeWidth="2.6" />
              <path d="M105 17h5.4l-5.4 6h5.4" strokeWidth="2.1" opacity="0.7" />
            </g>
          )}
        </g>
      </svg>
    </span>
  );
}
