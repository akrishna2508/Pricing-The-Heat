type Props = { points: Array<{ ts: string; mu_tevi: number }> };

const WIDTH = 280;
const HEIGHT = 48;

export function Sparkline({ points }: Props) {
  if (points.length === 0) return null;

  const values = points.map((p) => p.mu_tevi);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1 || 1)) * WIDTH;
      const y = HEIGHT - ((p.mu_tevi - min) / range) * HEIGHT;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={WIDTH} height={HEIGHT} role="img" aria-label="mu-TEVI index over the coverage window">
      <path d={path} fill="none" stroke="#e34a33" strokeWidth={1.5} />
    </svg>
  );
}
