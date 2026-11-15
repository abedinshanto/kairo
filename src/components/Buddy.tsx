import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "./ui";
import { useApp } from "../lib/store";
import "../styles/kai.css";

export type BuddyMood = "idle" | "focus" | "break" | "paused" | "happy" | "sleep" | "listen" | "think" | "calm";
export type BuddyTone = "leaf" | "cloud" | "sky" | "lilac";

type Palette = {
  /** key light (top-left) */
  hi: string;
  /** body base */
  mid: string;
  /** shadow side */
  lo: string;
  /** core / occlusion shadow and the ground */
  deep: string;
  /** leaves: base → tip */
  leafLo: string;
  leafHi: string;
  blush: string;
};

const INK = "#1b2a21";
const TONGUE = "#ff8f8a";

const TONES: Record<BuddyTone, Palette> = {
  leaf: { hi: "#f7fdf4", mid: "#dcf2d9", lo: "#a3d8ad", deep: "#4f9f6c", leafLo: "#3b9a5c", leafHi: "#93d8a2", blush: "#ff9d93" },
  cloud: { hi: "#ffffff", mid: "#f6faf5", lo: "#d3e6d6", deep: "#7aa98a", leafLo: "#3b9a5c", leafHi: "#93d8a2", blush: "#ffa59c" },
  sky: { hi: "#f6fbff", mid: "#dcedfb", lo: "#a9cdee", deep: "#4d84b8", leafLo: "#3b9a5c", leafHi: "#93d8a2", blush: "#ff9d9d" },
  lilac: { hi: "#fbf8ff", mid: "#e8e0fb", lo: "#c2b3ef", deep: "#7a63c6", leafLo: "#3b9a5c", leafHi: "#93d8a2", blush: "#ff9db6" },
};

/** A soft mochi: domed top, plump sides, sitting flat on the ground (y 104). */
const BODY =
  "M60 37C83 37 100.5 52.5 102.6 74.5C104.4 92.5 95.5 103 80.5 104C70 104.7 50 104.7 39.5 104C24.5 103 15.6 92.5 17.4 74.5C19.5 52.5 37 37 60 37Z";
const LEAF_L = "M60.6 28.6C56.4 20.6 47.6 17.2 40.6 20C44.2 26.8 52.4 30.6 60.6 28.6Z";
const LEAF_R = "M60.6 28.6C62.6 19.4 71.4 12.6 82.2 13.6C80.4 23 71 29.8 60.6 28.6Z";
/** Open grin (happy). */
const GRIN = "M51.6 81.4Q60 82.8 68.4 81.4Q67.4 91.4 60 91.4Q52.6 91.4 51.6 81.4Z";

const EYE_Y = 73;
const EYES = [46, 74];

const line = { stroke: INK, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

// ------------------------------------------------------------------ Eyes that follow the pointer

/** Every mascot on screen looks towards the pointer (one shared listener). */
const watchers = new Set<HTMLElement>();
let lastMove = 0;
let frame = 0;
let pointer: { x: number; y: number } | null = null;

function aim() {
  frame = 0;
  if (!pointer) return;
  for (const el of watchers) {
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const dx = pointer.x - (r.left + r.width / 2);
    const dy = pointer.y - (r.top + r.height * 0.6);
    const d = Math.hypot(dx, dy) || 1;
    // Full glance once the pointer is a little way off; a nearby pointer gets a gentler look.
    const reach = Math.min(1, d / 160);
    el.style.setProperty("--lx", `${((dx / d) * 2.6 * reach).toFixed(2)}px`);
    el.style.setProperty("--ly", `${((dy / d) * 1.8 * reach).toFixed(2)}px`);
  }
}

function onPointer(e: PointerEvent) {
  pointer = { x: e.clientX, y: e.clientY };
  lastMove = performance.now();
  if (!frame) frame = requestAnimationFrame(aim);
}

function watch(el: HTMLElement) {
  if (!watchers.size) window.addEventListener("pointermove", onPointer, { passive: true });
  watchers.add(el);
  return () => {
    watchers.delete(el);
    if (!watchers.size) window.removeEventListener("pointermove", onPointer);
  };
}

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ------------------------------------------------------------------ Kai

/**
 * Kai, Kairo's focus buddy: a soft mochi with a sprout on top. It breathes, its
 * leaves sway, it blinks and glances around, its eyes follow the pointer, it
 * squishes when tapped and pops a little whenever its mood changes. The face
 * follows the timer: curious when idle, serene while you focus, sunglasses on
 * for a break, all ears while you dictate and asleep when nothing's going on.
 */
export function Buddy({
  mood = "idle",
  tone = "leaf",
  size = 96,
  still = false,
  label,
  bloom,
}: {
  mood?: BuddyMood;
  tone?: BuddyTone;
  size?: number;
  still?: boolean;
  label?: string;
  /** A blossom on the sprout (by default: once today's focus goal is met). */
  bloom?: boolean;
}) {
  const goalMet = useApp((s) => s.bloom);
  const blossom = bloom ?? goalMet;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const root = useRef<HTMLSpanElement>(null);
  const c = TONES[tone];
  const u = (k: string) => `url(#${k}${id})`;
  const openEyes = mood === "idle" || mood === "paused" || mood === "listen" || mood === "think";

  // Life: blinks (sometimes double) and idle glances, at natural, uneven intervals.
  useEffect(() => {
    const el = root.current;
    if (!el || still || reducedMotion()) return;
    let timer = 0;
    let glance = 0;
    const blink = () => {
      if (document.visibilityState === "visible") {
        el.dataset.blink = "";
        window.setTimeout(() => delete el.dataset.blink, 130);
        if (Math.random() < 0.22) {
          window.setTimeout(() => (el.dataset.blink = ""), 260);
          window.setTimeout(() => delete el.dataset.blink, 390);
        }
      }
      timer = window.setTimeout(blink, 2600 + Math.random() * 4200);
    };
    const look = () => {
      // Only when the pointer has been still for a while: then Kai looks about by itself.
      if (performance.now() - lastMove > 4000 && document.visibilityState === "visible") {
        const r = Math.random();
        const [x, y] = r < 0.35 ? [0, 0] : r < 0.6 ? [-2.4, 0.4] : r < 0.85 ? [2.4, 0.2] : [0.6, -1.6];
        el.style.setProperty("--lx", `${x}px`);
        el.style.setProperty("--ly", `${y}px`);
      }
      glance = window.setTimeout(look, 2200 + Math.random() * 3800);
    };
    timer = window.setTimeout(blink, 900 + Math.random() * 2400);
    glance = window.setTimeout(look, 1600 + Math.random() * 2000);
    const unwatch = size >= 40 ? watch(el) : () => {};
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(glance);
      unwatch();
    };
  }, [still, size]);

  // A little pop when the mood changes (not on first paint).
  const shown = useRef(mood);
  useEffect(() => {
    const el = root.current;
    if (shown.current === mood) return;
    shown.current = mood;
    if (!el || still) return;
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
  }, [mood, still]);

  const boop = () => {
    const el = root.current;
    if (!el || still) return;
    el.classList.remove("boop");
    void el.offsetWidth;
    el.classList.add("boop");
  };

  /** Solid ink eye with a crisp key catchlight and a small bounce glint. */
  const openEye = (x: number, y: number, rx: number, ry: number) => (
    <g key={x}>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={INK} />
      <circle cx={x - rx * 0.32} cy={y - ry * 0.36} r={rx * 0.38} fill="#fff" />
      <circle cx={x + rx * 0.38} cy={y + ry * 0.4} r={rx * 0.15} fill="#fff" opacity="0.85" />
    </g>
  );

  let eyes: ReactNode = null;
  if (mood === "idle") eyes = <>{EYES.map((x) => openEye(x, EYE_Y, 5.2, 6.4))}</>;
  else if (mood === "paused") eyes = <>{EYES.map((x) => openEye(x - 2.4, EYE_Y - 0.6, 5.2, 6.4))}</>;
  else if (mood === "listen") eyes = <>{EYES.map((x) => openEye(x, EYE_Y - 0.8, 5.9, 7.2))}</>;
  else if (mood === "think") eyes = <>{EYES.map((x) => openEye(x + 2.2, EYE_Y - 1.8, 5, 6.2))}</>;
  // focus: eyes a touch narrower, resting on the work (and not following the pointer)
  else if (mood === "focus") eyes = <>{EYES.map((x) => openEye(x, EYE_Y + 1.4, 4.9, 5.4))}</>;

  return (
    <span
      ref={root}
      className={cx("kai", `mood-${mood}`, `tone-${tone}`, still && "still")}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      onPointerDown={boop}
      onAnimationEnd={(e) => {
        if (e.animationName === "kai-pop" || e.animationName === "kai-boop") root.current?.classList.remove("pop", "boop");
      }}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 120 120">
        <defs>
          <radialGradient id={`body${id}`} gradientUnits="userSpaceOnUse" cx="44" cy="50" r="74" fx="40" fy="46">
            <stop offset="0" stopColor={c.hi} />
            <stop offset="0.46" stopColor={c.mid} />
            <stop offset="1" stopColor={c.lo} />
          </radialGradient>
          <radialGradient id={`core${id}`} gradientUnits="userSpaceOnUse" cx="70" cy="114" r="52">
            <stop offset="0" stopColor={c.deep} stopOpacity="0.5" />
            <stop offset="0.55" stopColor={c.deep} stopOpacity="0.16" />
            <stop offset="1" stopColor={c.deep} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`bloom${id}`} gradientUnits="userSpaceOnUse" cx="42" cy="50" r="24">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`rim${id}`} gradientUnits="userSpaceOnUse" x1="96" y1="100" x2="72" y2="70">
            <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`leafL${id}`} gradientUnits="userSpaceOnUse" x1="60" y1="29" x2="41" y2="19">
            <stop offset="0" stopColor={c.leafLo} />
            <stop offset="1" stopColor={c.leafHi} />
          </linearGradient>
          <linearGradient id={`leafR${id}`} gradientUnits="userSpaceOnUse" x1="60" y1="29" x2="82" y2="13">
            <stop offset="0" stopColor={c.leafLo} />
            <stop offset="1" stopColor={c.leafHi} />
          </linearGradient>
          <radialGradient id={`blush${id}`}>
            <stop offset="0" stopColor={c.blush} stopOpacity="0.8" />
            <stop offset="0.6" stopColor={c.blush} stopOpacity="0.35" />
            <stop offset="1" stopColor={c.blush} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`petal${id}`} gradientUnits="userSpaceOnUse" cx="60.8" cy="24.4" r="9">
            <stop offset="0.25" stopColor="#ffe3ea" />
            <stop offset="1" stopColor="#ff9fba" />
          </radialGradient>
          <radialGradient id={`ground${id}`}>
            <stop offset="0" stopColor={c.deep} stopOpacity="0.32" />
            <stop offset="1" stopColor={c.deep} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`lens${id}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#2f5440" />
            <stop offset="1" stopColor="#13221a" />
          </linearGradient>
          <clipPath id={`clip${id}`}>
            <path d={BODY} />
          </clipPath>
          <mask id={`rimMask${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
            <path d={BODY} fill="#fff" />
            <path d={BODY} fill="#000" transform="translate(-1.1 -1.4)" />
          </mask>
          <clipPath id={`grin${id}`}>
            <path d={GRIN} />
          </clipPath>
        </defs>

        <ellipse className="kai-ground" cx="60" cy="106" rx="35" ry="4.6" fill={u("ground")} />

        <g className="kai-hop">
          <g className="kai-sway">
            <g className="kai-breathe">
              {/* the sprout rides on the body, swaying on its own stem */}
              <g className="kai-sprout">
                <path d="M60.2 39.5C59.6 35 60 31.4 60.8 28.4" {...line} stroke={c.leafLo} strokeWidth="2.8" />
                <g className="kai-leaf left">
                  <path d={LEAF_L} fill={u("leafL")} />
                  <path d="M59.6 28.2Q51.6 23.6 43.6 21.2" stroke="#fff" strokeOpacity="0.4" strokeWidth="0.9" strokeLinecap="round" fill="none" />
                </g>
                <g className="kai-leaf right">
                  <path d={LEAF_R} fill={u("leafR")} />
                  <path d="M61.6 27.6Q69.6 20 79.6 15.4" stroke="#fff" strokeOpacity="0.4" strokeWidth="0.9" strokeLinecap="round" fill="none" />
                </g>
                {blossom && (
                  // Goal met: a little blossom where the leaves meet.
                  <g className="kai-blossom">
                    {[0, 72, 144, 216, 288].map((a) => (
                      <ellipse key={a} cx="60.8" cy="19.6" rx="3.3" ry="4.6" fill={u("petal")} transform={`rotate(${a} 60.8 24.4)`} />
                    ))}
                    <circle cx="60.8" cy="24.4" r="2.6" fill="#ffd56b" />
                    <circle cx="60.1" cy="23.7" r="0.9" fill="#fff" opacity="0.8" />
                  </g>
                )}
              </g>

              {/* body: base, core shadow, soft key light, rim, specular */}
              <path d={BODY} fill={u("body")} />
              <g clipPath={u("clip")}>
                <rect width="120" height="120" fill={u("core")} />
                <rect width="120" height="120" fill={u("bloom")} />
              </g>
              <path d={BODY} fill={u("rim")} mask={u("rimMask")} />
              <ellipse cx="38.5" cy="53" rx="6.4" ry="3.4" fill="#fff" opacity="0.8" transform="rotate(-34 38.5 53)" />

              <g className="kai-face">
                <ellipse cx="34" cy="83" rx="7.6" ry="4.8" fill={u("blush")} />
                <ellipse cx="86" cy="83" rx="7.6" ry="4.8" fill={u("blush")} />

                {eyes ? (
                  <g className={cx("kai-eyes", openEyes && "can-look")}>{eyes}</g>
                ) : mood === "break" ? (
                  // Off duty: sunglasses on.
                  <g className="kai-shades">
                    <path d="M33 70.5Q46 67.6 56 69.4M64 69.4Q74 67.6 87 70.5" {...line} strokeWidth="2" opacity="0.85" />
                    <rect x="33.6" y="66.6" width="23" height="14.6" rx="6.6" fill={u("lens")} />
                    <rect x="63.4" y="66.6" width="23" height="14.6" rx="6.6" fill={u("lens")} />
                    <path d="M56.4 70.6Q60 68.2 63.6 70.6" {...line} strokeWidth="2.2" />
                    <path d="M38.6 76.4L45.4 69.6M68.4 76.4L75.2 69.6" stroke="#fff" strokeOpacity="0.32" strokeWidth="2.2" strokeLinecap="round" />
                  </g>
                ) : (
                  <g {...line} strokeWidth="2.9">
                    {EYES.map((x) =>
                      mood === "happy" ? (
                        <path key={x} d={`M${x - 5.4} ${EYE_Y + 2}Q${x} ${EYE_Y - 5.6} ${x + 5.4} ${EYE_Y + 2}`} />
                      ) : (
                        // sleep, calm: softly closed
                        <path key={x} d={`M${x - 5.2} ${EYE_Y - 0.4}Q${x} ${EYE_Y + 4.6} ${x + 5.2} ${EYE_Y - 0.4}`} />
                      ),
                    )}
                  </g>
                )}

                {mood === "happy" ? (
                  <g>
                    <path d={GRIN} fill={INK} />
                    <ellipse cx="60" cy="91" rx="5" ry="3.8" fill={TONGUE} clipPath={u("grin")} />
                  </g>
                ) : mood === "break" ? (
                  <path d="M52.4 85Q60 92 67.6 85" {...line} strokeWidth="2.6" />
                ) : mood === "paused" ? (
                  <ellipse cx="58.4" cy="86" rx="2.2" ry="2.6" fill={INK} />
                ) : mood === "listen" ? (
                  <ellipse cx="60" cy="86.4" rx="2.7" ry="3.3" fill={INK} />
                ) : mood === "think" ? (
                  <path d="M55.6 86.4q2.2-1.8 4.4 0t4.4 0" {...line} strokeWidth="2.3" />
                ) : mood === "sleep" ? (
                  <path d="M57.2 85.6Q60 87.6 62.8 85.6" {...line} strokeWidth="2.2" />
                ) : mood === "calm" ? (
                  <path d="M55.6 84.6Q60 88.4 64.4 84.6" {...line} strokeWidth="2.3" />
                ) : mood === "focus" ? (
                  <path d="M56.2 85Q60 87.6 63.8 85" {...line} strokeWidth="2.3" />
                ) : (
                  <path d="M54.4 84.2Q60 89.4 65.6 84.2" {...line} strokeWidth="2.5" />
                )}
              </g>
            </g>
          </g>
        </g>

        {mood === "sleep" && (
          <g className="kai-zz" {...line} stroke={c.deep}>
            <path className="z one" d="M92 40h6.4l-6.4 7.2h6.4" strokeWidth="2.4" />
            <path className="z two" d="M101 26h5l-5 5.6h5" strokeWidth="2" />
          </g>
        )}
      </svg>
    </span>
  );
}
