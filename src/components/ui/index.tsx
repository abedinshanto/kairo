import { ArrowDownRight, ArrowUpRight, Bell, Check, Minus, Plus, TriangleAlert, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { productivityClass } from "../../lib/categories";
import { useApp } from "../../lib/store";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ Segmented

export interface SegOption<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size,
  label,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm";
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    else setThumb(null);
  }, [value, options.length]);
  return (
    <div ref={ref} className={cx("segmented", size)} role="group" aria-label={label}>
      {thumb && <span className="seg-thumb" style={{ left: thumb.left, width: thumb.width }} />}
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Switch

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

// ------------------------------------------------------------------ Slider

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="slider"
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

// ------------------------------------------------------------------ Modal

export function Modal({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Monogram (app / site avatar)

export function Monogram({ name, kind = "app", productivity }: { name: string; kind?: "app" | "site"; productivity?: number }) {
  const clean = name.replace(/^www\./, "").replace(/\.(com|org|net|io|ai|app|so|tv|dev)$/, "");
  const letters = clean
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span className={cx("monogram", kind === "site" && "site")} aria-hidden>
      {letters || "?"}
      {productivity !== undefined && <span className={cx("mono-dot", "dot", productivityClass(productivity))} />}
    </span>
  );
}

// ------------------------------------------------------------------ Delta

/** Signed change vs a named period. `goodWhenUp` decides the colour. */
export function Delta({ value, goodWhenUp = true, suffix, format }: { value: number | null; goodWhenUp?: boolean; suffix?: string; format?: (v: number) => string }) {
  if (value === null || !Number.isFinite(value)) return <span className="delta">—</span>;
  const up = value > 0;
  const flat = Math.abs(value) < 0.005;
  const good = flat ? null : up === goodWhenUp;
  const text = format ? format(Math.abs(value)) : `${Math.round(Math.abs(value) * 100)}%`;
  return (
    <span className={cx("delta", good === true && "good", good === false && "bad")}>
      {flat ? <Minus /> : up ? <ArrowUpRight /> : <ArrowDownRight />}
      {text}
      {suffix && <span className="faint" style={{ fontWeight: 450, marginLeft: 3 }}>{suffix}</span>}
    </span>
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
          <span className={cx("toast-icon", t.tone)}>{t.tone === "success" ? <Check /> : t.tone === "warning" ? <TriangleAlert /> : <Bell />}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="toast-title">{t.title}</div>
            {t.body && <div className="toast-body">{t.body}</div>}
          </div>
          <button className="icon-btn sm" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <X />
          </button>
        </div>
      ))}
    </div>
  );
}
