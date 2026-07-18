type Props = {
  strike: number;
  cap: number;
  samplePoints: Record<string, number>;
};

const WIDTH = 320;
const HEIGHT = 140;
const PAD = 24;

function payoutFraction(index: number, strike: number, cap: number): number {
  const frac = (index - strike) / (100 - strike);
  return cap * Math.min(Math.max(frac, 0), 1);
}

/** Renders the parametric payout curve (cap * (index - strike)+ / (100 - strike))
 * entirely client-side from the priced contract's own strike/cap -- the same
 * formula backend/main.py's payout_schedule documents, so this never drifts
 * from what was actually priced. */
export function PayoutChart({ strike, cap, samplePoints }: Props) {
  const points: Array<[number, number]> = [];
  for (let idx = 0; idx <= 100; idx += 2) {
    points.push([idx, payoutFraction(idx, strike, cap)]);
  }

  const xScale = (idx: number) => PAD + (idx / 100) * (WIDTH - 2 * PAD);
  const yScale = (frac: number) => HEIGHT - PAD - (frac / cap) * (HEIGHT - 2 * PAD);

  const path = points
    .map(([idx, frac], i) => `${i === 0 ? "M" : "L"} ${xScale(idx).toFixed(1)} ${yScale(frac).toFixed(1)}`)
    .join(" ");

  return (
    <svg width={WIDTH} height={HEIGHT} role="img" aria-label="Payout schedule chart">
      <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="#d4d4d8" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} stroke="#d4d4d8" />
      <line
        x1={xScale(strike)} y1={PAD} x2={xScale(strike)} y2={HEIGHT - PAD}
        stroke="#b30000" strokeDasharray="3 3"
      />
      <path d={path} fill="none" stroke="#e34a33" strokeWidth={2} />
      {Object.entries(samplePoints).map(([idxStr, frac]) => (
        <circle key={idxStr} cx={xScale(Number(idxStr))} cy={yScale(frac)} r={3} fill="#b30000" />
      ))}
      <text x={PAD} y={HEIGHT - 6} fontSize={9} fill="#71717a">0</text>
      <text x={WIDTH - PAD - 16} y={HEIGHT - 6} fontSize={9} fill="#71717a">100</text>
      <text x={xScale(strike) + 3} y={PAD + 8} fontSize={9} fill="#b30000">
        strike {strike}
      </text>
    </svg>
  );
}
