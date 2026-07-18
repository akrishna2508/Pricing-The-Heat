type Props = { contributions: Record<string, number> };

/** Renders feature contributions AS-IS -- if one feature (typically
 * max_index_in_window) dominates at ~99.7%, that is the honest explanation
 * for this payoff and is shown that way; no artificial rebalancing. */
export function FeatureBars({ contributions }: Props) {
  const entries = Object.entries(contributions).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-2">
      {entries.map(([name, value]) => (
        <div key={name} className="text-sm">
          <div className="flex justify-between mb-1">
            <span className="text-gray-700">{name.replace(/_/g, " ")}</span>
            <span className="font-mono">{(value * 100).toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded h-2">
            <div
              className="bg-heat-4 h-2 rounded"
              style={{ width: `${Math.min(Math.max(value * 100, 1), 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
