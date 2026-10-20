import { useId } from "react";
import { cx } from "./ui";

export type BuddyMood = "idle" | "focus" | "break" | "paused" | "happy" | "sleep";
export type BuddyTone = "blue" | "mint" | "violet" | "cloud";

const TONES: Record<BuddyTone, { hi: string; mid: string; lo: string; cheek: string; ink: string; lid: string }> = {
  blue: { hi: "#c3d4ff", mid: "#6d94ff", lo: "#2a5cf2", cheek: "#ff9db8", ink: "#0f1a3d", lid: "#4f7cfb" },
  mint: { hi: "#c8f5e6", mid: "#4fd6aa", lo: "#0e9e76", cheek: "#ff9db8", ink: "#0b2a20", lid: "#2bbd90" },
  violet: { hi: "#e1d9ff", mid: "#a790ff", lo: "#6a48f0", cheek: "#ffa3c4", ink: "#1d1240", lid: "#8a6ffa" },
  cloud: { hi: "#ffffff", mid: "#f1f5ff", lo: "#d6e2ff", cheek: "#ffb3c6", ink: "#132150", lid: "#e3ebff" },
};

/**
 * Kai — Kairo's little focus buddy. A soft gradient blob whose face follows the
 * timer: curious when idle, heavy-lidded and steady while focusing, blissful on
 * breaks.
 */
export function Buddy({ mood = "idle", tone = "blue", size = 96, still = false, label }: { mood?: BuddyMood; tone?: BuddyTone; size?: number; still?: boolean; label?: string }) {
  const id = useId().replace(/:/g, "");
  const c = TONES[tone];
  const closed = mood === "break" || mood === "sleep" || mood === "happy";

  return (
    <span className={cx("buddy", `mood-${mood}`, still && "still")} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <defs>
          <radialGradient id={`b${id}`} cx="0.36" cy="0.3" r="0.82">
            <stop offset="0" stopColor={c.hi} />
            <stop offset="0.48" stopColor={c.mid} />
            <stop offset="1" stopColor={c.lo} />
          </radialGradient>
          <radialGradient id={`g${id}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={c.mid} stopOpacity="0.45" />
            <stop offset="1" stopColor={c.mid} stopOpacity="0" />
          </radialGradient>
          <filter id={`s${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        {/* ground shadow */}
        <ellipse cx="60" cy="110" rx="27" ry="4.5" fill={c.lo} opacity="0.18" filter={`url(#s${id})`} />

        <g className="buddy-float">
          {/* aura */}
          <circle cx="60" cy="60" r="56" fill={`url(#g${id})`} />
          {/* body */}
          <path d="M60 15c25 0 41 17 42 43 1 27-11 46-42 46S17 85 18 58c1-26 17-43 42-43Z" fill={`url(#b${id})`} />
          {/* sheen */}
          <ellipse cx="44" cy="33" rx="15" ry="8" fill="#fff" opacity="0.45" transform="rotate(-24 44 33)" filter={`url(#s${id})`} />

          {/* cheeks */}
          <ellipse cx="34" cy="70" rx="7" ry="4" fill={c.cheek} opacity={mood === "focus" ? 0.25 : 0.45} />
          <ellipse cx="86" cy="70" rx="7" ry="4" fill={c.cheek} opacity={mood === "focus" ? 0.25 : 0.45} />

          {/* eyes */}
          {closed ? (
            <g stroke={c.ink} strokeWidth="3.2" strokeLinecap="round" fill="none">
              {mood === "happy" ? (
                <>
                  <path d="M38 58q7-8 14 0" />
                  <path d="M68 58q7-8 14 0" />
                </>
              ) : (
                <>
                  <path d="M38 56q7 7 14 0" />
                  <path d="M68 56q7 7 14 0" />
                </>
              )}
            </g>
          ) : (
            <g className="buddy-eyes">
              <ellipse cx="45" cy="57" rx="10.5" ry="12" fill="#fff" />
              <ellipse cx="75" cy="57" rx="10.5" ry="12" fill="#fff" />
              <circle cx={mood === "paused" ? 41 : 46} cy={mood === "focus" ? 61 : 59} r="5.4" fill={c.ink} />
              <circle cx={mood === "paused" ? 71 : 76} cy={mood === "focus" ? 61 : 59} r="5.4" fill={c.ink} />
              <circle cx={mood === "paused" ? 39.5 : 44.5} cy={mood === "focus" ? 59 : 57} r="1.6" fill="#fff" />
              <circle cx={mood === "paused" ? 69.5 : 74.5} cy={mood === "focus" ? 59 : 57} r="1.6" fill="#fff" />
              {mood === "focus" && (
                <>
                  {/* calm, heavy lids: steady concentration */}
                  <path d="M33.5 57a11.5 13 0 0 1 23 0Z" fill={c.lid} />
                  <path d="M63.5 57a11.5 13 0 0 1 23 0Z" fill={c.lid} />
                </>
              )}
            </g>
          )}

          {/* mouth */}
          {mood === "happy" ? (
            <path d="M51 76q9 10 18 0Z" fill={c.ink} />
          ) : mood === "focus" ? (
            <path d="M55 78h10" stroke={c.ink} strokeWidth="3" strokeLinecap="round" />
          ) : mood === "paused" ? (
            <circle cx="60" cy="78" r="2.8" fill={c.ink} />
          ) : (
            <path d="M53 76q7 6 14 0" stroke={c.ink} strokeWidth="3" strokeLinecap="round" fill="none" />
          )}

          {mood === "sleep" && (
            <g fill={c.lo} fontFamily="inherit" fontWeight="800" opacity="0.8">
              <text x="92" y="30" fontSize="12">z</text>
              <text x="101" y="20" fontSize="9">z</text>
            </g>
          )}
        </g>
      </svg>
    </span>
  );
}
