import { ArrowDownRight, ArrowUpRight, Bell, Check, ChevronsRight, Minus, Plus, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useApp } from "../../lib/store";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ Page title (two-tone, like the references)

/** `"Hi Sam,"` in ink and `"ready to focus?"` dimmed — the references' signature heading. */
export function PageTitle({ strong, dim, size = "display" }: { strong: ReactNode; dim?: ReactNode; size?: "display" | "title" }) {
  return (
    <h1 className={size}>
      {strong}
      {dim && (
        <>
          {" "}
          <span className="dim">{dim}</span>
        </>
      )}
    </h1>
  );
}

// ------------------------------------------------------------------ Top bar

export function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="topbar" data-tauri-drag-region>
      <div className="topbar-left" data-tauri-drag-region>
        {left}
      </div>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

// ------------------------------------------------------------------ Pill tabs

export interface PillOption<T extends string | number> {
  value: T;
  label: ReactNode;
  count?: ReactNode;
  disabled?: boolean;
}

export function PillTabs<T extends string | number>({
  options,
  value,
  onChange,
  size,
  label,
}: {
  options: PillOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm";
  label: string;
}) {
  return (
    <div className={cx("pills", size)} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={cx("pill", o.value === value && "active")}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="pill-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Segmented (compact choice)

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm";
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Switch

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />;
}

// ------------------------------------------------------------------ Slider

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  onBrand,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  onBrand?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className={cx("slider", onBrand && "on-brand")}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ ["--val" as string]: `${pct}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

// ------------------------------------------------------------------ Stepper

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = String,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  label: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        <Minus />
      </button>
      <span className="value" aria-live="polite">
        {format(value)}
      </span>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        <Plus />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ Sheet (bottom sheet on phones, dialog on desktop)

export function Sheet({ onClose, children, label, closable = true }: { onClose: () => void; children: ReactNode; label: string; closable?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closable && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, closable]);
  return (
    <div className="sheet-scrim" onMouseDown={(e) => closable && e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-handle" aria-hidden />
        {closable && (
          <button className="circle-btn sm soft sheet-close" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/** @deprecated use Sheet */
export const Modal = Sheet;

// ------------------------------------------------------------------ Avatar (app / site initials)

export function Avatar({ name, productivity, size = 44 }: { name: string; productivity?: number; size?: number }) {
  const clean = name.replace(/^www\./, "").replace(/\.(com|org|net|io|ai|app|so|tv|dev|us)$/, "");
  const letters = clean
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const p = productivity === undefined ? 1 : Math.sign(productivity);
  return (
    <span className={cx("avatar", `p-${p}`)} style={{ width: size, height: size, fontSize: Math.round(size * 0.32) }} aria-hidden>
      {letters || "?"}
    </span>
  );
}

/** @deprecated use Avatar */
export function Monogram({ name, productivity }: { name: string; kind?: "app" | "site"; productivity?: number }) {
  return <Avatar name={name} productivity={productivity} />;
}

// ------------------------------------------------------------------ Delta pill

/** Signed change vs a named period; colour = direction × whether up is good. */
export function Delta({ value, goodWhenUp = true, format }: { value: number | null; goodWhenUp?: boolean; format?: (v: number) => string }) {
  if (value === null || !Number.isFinite(value)) return null;
  const up = value > 0;
  const flat = Math.abs(value) < 0.005;
  const good = flat ? null : up === goodWhenUp;
  const text = format ? format(Math.abs(value)) : `${Math.round(Math.abs(value) * 100)}%`;
  return (
    <span className={cx("delta", good === true && "good", good === false && "bad")}>
      {flat ? <Minus /> : up ? <ArrowUpRight /> : <ArrowDownRight />}
      {text}
    </span>
  );
}

// ------------------------------------------------------------------ Slide to confirm ("Drag to mark done")

export function SlideToConfirm({ label, onConfirm, light, icon }: { label: string; onConfirm: () => void; light?: boolean; icon?: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState<{ start: number; base: number } | null>(null);
  const max = () => (track.current ? track.current.clientWidth - 64 : 200);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ start: e.clientX, base: x });
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setX(Math.min(max(), Math.max(0, drag.base + e.clientX - drag.start)));
  };
  const onUp = () => {
    if (!drag) return;
    setDrag(null);
    if (x >= max() * 0.85) {
      setX(max());
      window.setTimeout(() => {
        onConfirm();
        setX(0);
      }, 160);
    } else setX(0);
  };

  return (
    <div ref={track} className={cx("slide", light && "light")}>
      <div className="slide-fill" style={{ width: x + 64, transition: drag ? "none" : "width .3s var(--ease)" }} />
      <div className="slide-label" style={{ opacity: 1 - x / Math.max(1, max()) }}>
        {label}
        <span className="chev">
          <ChevronsRight size={18} />
        </span>
      </div>
      <div
        className="slide-knob"
        role="button"
        tabIndex={0}
        aria-label={label}
        style={{ transform: `translateX(${x}px)`, transition: drag ? "none" : "transform .3s var(--ease)" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onConfirm()}
      >
        {icon ?? <Check />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Toasts

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" role="status">
          <span className={cx("icon-tile", t.tone === "success" ? "good" : t.tone === "warning" ? "warn" : undefined)}>
            {t.tone === "success" ? <Check /> : t.tone === "warning" ? <TriangleAlert /> : <Bell />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="toast-title">{t.title}</div>
            {t.body && <div className="toast-body">{t.body}</div>}
          </div>
          <button className="circle-btn sm soft" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <X />
          </button>
        </div>
      ))}
    </div>
  );
}
