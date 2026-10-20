/**
 * A 0–100 score as a ring. `onBrand` draws white on a translucent track for hero
 * cards; otherwise it uses the brand colour on a sunk track.
 */
export function ScoreRing({
  value,
  size = 120,
  stroke = 10,
  label = "score",
  onBrand = false,
  title,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  label?: string;
  onBrand?: boolean;
  title?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div
      className={onBrand ? "score-ring on-brand" : "score-ring"}
      style={{ width: size, height: size }}
      role="img"
      aria-label={value === null ? "No productivity score yet" : `Productivity score ${value} out of 100`}
      title={title}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="score-track" strokeWidth={stroke} />
        {value !== null && v > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            className="score-fill"
            strokeWidth={stroke}
            strokeDasharray={`${(c * v) / 100} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="score-center">
        <span className="score-value">{value ?? "–"}</span>
        <span className="score-label">{label}</span>
      </div>
    </div>
  );
}
