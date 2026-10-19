import {
  AudioWaveform,
  Bird,
  CloudLightning,
  CloudRain,
  Droplets,
  Flame,
  Headphones,
  Moon,
  Orbit,
  Pause,
  Play,
  Radio,
  Volume2,
  Waves,
  Wind,
} from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "../components/PageHeader";
import { Segmented, Slider, Switch, cx } from "../components/ui";
import { PRESETS, SOUNDS, soundEngine, type SoundId } from "../lib/audio/engine";
import { useApp } from "../lib/store";
import type { ChimeId } from "../lib/types";

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

  const setLevel = (id: SoundId, v: number) => {
    const next = { ...sound.levels, [id]: v };
    if (v <= 0) delete next[id];
    updateSound({ levels: next });
    if (v > 0 && !soundEngine.playing) void soundEngine.play();
  };

  return (
    <div>
      <PageHeader title="Sounds" subtitle="Soundscapes are generated on your device as they play. No streaming, no downloads." />

      <div className={cx("card player", playing && "is-playing")}>
        <div className="player-art" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <button className="player-btn" aria-label={playing ? "Pause" : "Play"} disabled={!active.length} onClick={() => void soundEngine.toggle()}>
          {playing ? <Pause /> : <Play />}
        </button>
        <div className="player-info">
          <div className="eyebrow">{playing ? "Now playing" : "Ready"}</div>
          <div className="player-title">{preset?.name ?? (active.length ? "Custom mix" : "Pick a sound below")}</div>
          <div className="faint player-sub">{active.map((s) => s.label).join(" · ") || "Mix any combination of sounds"}</div>
        </div>
        <div className="player-volume">
          <Volume2 />
          <Slider label="Master volume" value={sound.master} onChange={(v) => updateSound({ master: v })} />
        </div>
      </div>

      <div className="player-options">
        <label className="option">
          <Switch label="Play automatically when a focus block starts" checked={sound.autoPlay} onChange={(v) => updateSound({ autoPlay: v })} />
          <span>Play when a focus block starts</span>
        </label>
        <label className="option">
          <Switch label="Fade out during breaks" checked={sound.pauseOnBreak} onChange={(v) => updateSound({ pauseOnBreak: v })} />
          <span>Fade out during breaks</span>
        </label>
      </div>

      <h2 className="section-title">Presets</h2>
      <div className="presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={cx("preset", `preset-${p.id}`, preset?.id === p.id && "active")}
            onClick={() => {
              updateSound({ levels: p.levels as Record<string, number> });
              if (!soundEngine.playing) void soundEngine.play();
            }}
          >
            <span className="preset-name">{p.name}</span>
            <span className="preset-desc">{p.description}</span>
            {preset?.id === p.id && playing && <span className="eq" aria-hidden><i /><i /><i /></span>}
          </button>
        ))}
      </div>

      {(["Nature", "Noise", "Tones"] as const).map((group) => (
        <section key={group}>
          <h2 className="section-title">{group}</h2>
          <div className="mixer">
            {SOUNDS.filter((s) => s.group === group).map((s) => {
              const level = levels[s.id] ?? 0;
              return (
                <div key={s.id} className={cx("mix-tile", level > 0 && "on")}>
                  <button className="mix-toggle" aria-pressed={level > 0} onClick={() => setLevel(s.id, level > 0 ? 0 : 0.5)}>
                    <span className="mix-icon">{ICONS[s.id]}</span>
                    <span className="mix-text">
                      <span className="mix-label">{s.label}</span>
                      <span className="mix-hint">{s.hint}</span>
                    </span>
                  </button>
                  <Slider label={`${s.label} volume`} value={level} onChange={(v) => setLevel(s.id, v)} />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <h2 className="section-title">Timer chime</h2>
      <div className="card">
        <div className="rows">
          <div className="row">
            <div>
              <div className="row-label">Sound</div>
              <div className="row-desc">Plays when a focus block or break ends.</div>
            </div>
            <div className="row-control">
              <Segmented<ChimeId>
                label="Chime"
                size="sm"
                value={sound.chime}
                onChange={(chime) => {
                  updateSound({ chime });
                  void soundEngine.chime(chime, sound.chimeVolume);
                }}
                options={[
                  { value: "bell", label: "Bell" },
                  { value: "soft", label: "Soft" },
                  { value: "digital", label: "Digital" },
                  { value: "none", label: "None" },
                ]}
              />
            </div>
          </div>
          <div className="row">
            <div className="row-label">Volume</div>
            <div className="row-control" style={{ width: 220 }}>
              <Slider label="Chime volume" value={sound.chimeVolume} onChange={(v) => updateSound({ chimeVolume: v })} />
              <button className="btn btn-secondary btn-sm" onClick={() => void soundEngine.chime(sound.chime, sound.chimeVolume)}>
                Test
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
