import {
  AudioWaveform,
  Bird,
  Brain,
  Check,
  CloudLightning,
  CloudMoonRain,
  CloudRain,
  Droplets,
  Flame,
  Headphones,
  Moon,
  Orbit,
  Pause,
  Play,
  Radio,
  Sparkles,
  Sunrise,
  Trees,
  Volume1,
  Volume2,
  Waves,
  Wind,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Buddy } from "../components/Buddy";
import { PageTitle, PillTabs, Slider, Switch, TopBar, cx } from "../components/ui";
import { PRESETS, SOUNDS, soundEngine, type Preset, type SoundId, type SoundMeta } from "../lib/audio/engine";
import { useApp } from "../lib/store";
import "../styles/views/sounds.css";

type Group = SoundMeta["group"];
const GROUPS: Group[] = ["Nature", "Noise", "Tones"];

const ICONS: Record<SoundId, ReactNode> = {
  rain: <CloudRain />,
  thunder: <CloudLightning />,
  ocean: <Waves />,
  wind: <Wind />,
  fire: <Flame />,
  stream: <Droplets />,
  forest: <Bird />,
  night: <Moon />,
  white: <Radio />,
  pink: <AudioWaveform />,
  brown: <AudioWaveform />,
  binaural: <Headphones />,
  drone: <Orbit />,
};

const PRESET_ICONS: Record<string, ReactNode> = {
  "deep-work": <Brain />,
  "rainy-night": <CloudMoonRain />,
  "ocean-calm": <Waves />,
  forest: <Trees />,
  campfire: <Flame />,
  flow: <Sparkles />,
};

export function SoundsView() {
  const sound = useApp((s) => s.settings.sound!);
  const playing = useApp((s) => s.soundPlaying);
  const updateSound = useApp((s) => s.updateSound);
  const levels = sound.levels as Partial<Record<SoundId, number>>;
  const active = SOUNDS.filter((s) => (levels[s.id] ?? 0) > 0);
  const preset = PRESETS.find((p) => {
    const keys = Object.keys(p.levels);
    return keys.length === active.length && keys.every((k) => (levels[k as SoundId] ?? 0) > 0);
  });
  const [group, setGroup] = useState<Group>(() => active[0]?.group ?? "Nature");

  const setLevel = (id: SoundId, v: number) => {
    const next = { ...sound.levels, [id]: v };
    if (v <= 0) delete next[id];
    updateSound({ levels: next });
    if (v > 0 && !soundEngine.playing) void soundEngine.play();
  };

  const applyPreset = (p: Preset) => {
    updateSound({ levels: p.levels as Record<string, number> });
    if (!soundEngine.playing) void soundEngine.play();
  };

  return (
    <div className="sounds">
      <TopBar
        left={
          <>
            <span className={cx("art sounds-thumb", `art-${preset?.id ?? "custom"}`)} aria-hidden>
              {playing ? <Equalizer /> : ((preset && PRESET_ICONS[preset.id]) ?? <Headphones />)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="who-name">{preset?.name ?? (active.length ? "Your own mix" : "Nothing playing")}</div>
              <div className="who-sub">
                {playing ? "Playing" : active.length ? "Paused" : "Pick a sound to begin"}
                {active.length > 0 && ` · ${active.length} sound${active.length === 1 ? "" : "s"}`}
              </div>
            </div>
          </>
        }
      />
      <PageTitle strong="Soundscapes," dim="tune out the noise." />

      <div className="sounds-grid">
        {/* ------------------------------------------------ Hero player */}
        <section className={cx("sky", playing && "is-playing")} aria-label="Now playing">
          <div className="sky-scenery" aria-hidden>
            <Cloud className="sky-bank left" />
            <Cloud className="sky-bank right" />
          </div>

          <div className="sky-kai">
            <span className="sky-ring" aria-hidden />
            <span className="sky-ring two" aria-hidden />
            <Buddy tone="cloud" mood={playing ? "happy" : "sleep"} size={132} />
            <Cloud className="sky-seat" />
          </div>

          <div className="sky-text">
            <h2 className="sky-title">{preset?.name ?? (active.length ? "Your own mix" : "Pick a sound")}</h2>
            <p className="sky-sub">{active.map((s) => s.label).join(" · ") || "Choose a preset or blend your own below."}</p>
          </div>

          <div className="sky-controls">
            <div className="sky-volume">
              <Volume1 aria-hidden />
              <Slider onBrand label="Master volume" value={sound.master} onChange={(v) => updateSound({ master: v })} />
              <Volume2 aria-hidden />
            </div>
            <button
              className="circle-btn on-brand xl sky-play"
              aria-label={playing ? "Pause soundscape" : "Play soundscape"}
              disabled={!active.length}
              onClick={() => void soundEngine.toggle()}
            >
              {playing ? <Pause className="fill" /> : <Play className="fill" />}
            </button>
          </div>
        </section>

        {/* ------------------------------------------------ Behaviour toggles */}
        <div className="card sounds-options">
          <label className="opt">
            <span className="icon-tile round">
              <Sunrise />
            </span>
            <span className="opt-text">
              <span className="opt-title">Play when a focus block starts</span>
              <span className="opt-sub">Your mix fades in with the timer.</span>
            </span>
            <Switch label="Play when a focus block starts" checked={sound.autoPlay} onChange={(v) => updateSound({ autoPlay: v })} />
          </label>
          <label className="opt">
            <span className="icon-tile round">
              <Moon />
            </span>
            <span className="opt-text">
              <span className="opt-title">Fade out during breaks</span>
              <span className="opt-sub">A little silence while you rest.</span>
            </span>
            <Switch label="Fade out during breaks" checked={sound.pauseOnBreak} onChange={(v) => updateSound({ pauseOnBreak: v })} />
          </label>
        </div>

        {/* ------------------------------------------------ Presets */}
        <section className="sounds-presets" aria-labelledby="presets-title">
          <h2 className="section-title" id="presets-title">
            Presets
          </h2>
          <div className="preset-grid">
            {PRESETS.map((p) => {
              const on = preset?.id === p.id;
              return (
                <button key={p.id} className={cx("preset art", `art-${p.id}`, on && "active")} aria-pressed={on} onClick={() => applyPreset(p)}>
                  <span className="preset-top">
                    <span className="preset-icon" aria-hidden>
                      {PRESET_ICONS[p.id] ?? <Headphones />}
                    </span>
                    {on ? (
                      <span className="preset-state" aria-hidden>
                        {playing ? <Equalizer /> : <Check strokeWidth={3} />}
                      </span>
                    ) : (
                      <span className="preset-state hint" aria-hidden>
                        <Play className="fill" />
                      </span>
                    )}
                  </span>
                  <span className="preset-text">
                    <span className="preset-name">{p.name}</span>
                    <span className="preset-desc">{p.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ------------------------------------------------ Mixer */}
        <section className="sounds-mixer" aria-labelledby="mixer-title">
          <div className="mixer-head">
            <div>
              <h2 className="section-title" id="mixer-title">
                Mix your own
              </h2>
              <p className="mixer-sub">Slide to blend. Every sound is made right on your device.</p>
            </div>
            <PillTabs<Group>
              label="Sound group"
              size="sm"
              value={group}
              onChange={setGroup}
              options={GROUPS.map((g) => {
                const n = active.filter((s) => s.group === g).length;
                return { value: g, label: g, count: n || undefined };
              })}
            />
          </div>

          <ul className="card list mix-list">
            {SOUNDS.filter((s) => s.group === group).map((s) => {
              const level = levels[s.id] ?? 0;
              const on = level > 0;
              return (
                <li key={s.id} className={cx("mix-row", on && "on")}>
                  <button className="mix-toggle" aria-label={s.label} aria-pressed={on} title={s.hint} onClick={() => setLevel(s.id, on ? 0 : 0.5)}>
                    {ICONS[s.id]}
                  </button>
                  <div className="mix-main">
                    <div className="mix-line">
                      <span className="mix-label" title={s.hint}>
                        {s.label}
                      </span>
                      {on && <span className="mix-level">{Math.round(level * 100)}%</span>}
                    </div>
                    <Slider label={`${s.label} volume`} value={level} onChange={(v) => setLevel(s.id, v)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Three little bars that dance while a mix plays. */
function Equalizer() {
  return (
    <span className="eq" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

/** A soft, fluffy cloud (Kai's seat and the hero's scenery). */
function Cloud({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={cx("cloud", className)} viewBox="0 0 220 92" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`c${id}`} x1="0" y1="8" x2="0" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#f6f4ff" />
          <stop offset="1" stopColor="#e4e6ff" />
        </linearGradient>
      </defs>
      <g fill={`url(#c${id})`}>
        <circle cx="62" cy="54" r="30" />
        <circle cx="106" cy="42" r="36" />
        <circle cx="150" cy="52" r="29" />
        <circle cx="182" cy="66" r="20" />
        <circle cx="36" cy="68" r="20" />
        <rect x="30" y="60" width="164" height="30" rx="15" />
      </g>
    </svg>
  );
}
