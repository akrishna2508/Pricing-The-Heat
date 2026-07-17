"""Heat-model reporting section: STGCN vs temporal AND spatial baselines.

TODO(Prompt 7 / backtest): this module is currently just the heat-model section
of what should become a full backtest report (pricing performance, claims,
copula fit, etc.). When that report is built, import `heat_model_section()`
from here and slot its returned text in as the heat-model paragraph rather than
re-deriving these numbers -- it reads the single source of truth
(notebooks/artifacts/spatial_baseline_metrics.json) written by
models.stgcn.evaluate_spatial, so the report and the underlying evaluation
script can never silently disagree with each other.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

METRICS_PATH = Path("notebooks/artifacts/spatial_baseline_metrics.json")


def heat_model_section(metrics_path: Path = METRICS_PATH) -> str:
    """The honest headline claim for the STGCN heat surface.

    States the STGCN's margin over BOTH the temporal baseline (persistence) and
    the spatial baselines (nearest_station, IDW) -- the spatial number is the
    one that actually defends "the model does useful spatial interpolation,"
    since the temporal margin alone (historical-mean / persistence) says
    nothing about generalization to an unseen location.
    """
    if not metrics_path.exists():
        raise FileNotFoundError(
            f"{metrics_path} does not exist. Run `python -m models.stgcn.evaluate_spatial` first."
        )
    data = json.loads(metrics_path.read_text())
    m = data["metrics"]
    gate = data["honesty_gate"]
    protocol = data["protocol"]

    lines = [
        "Heat model (STGCN) -- held-out evaluation",
        f"  {protocol['n_cells']} cells, {len(protocol['held_out_nodes'])} unseen "
        f"locations x {protocol['n_val_windows']} unseen time windows x "
        f"{protocol['horizon']}-day horizon.",
        f"  STGCN MAE            : {m['stgcn']['mae_c']:.4f} degC",
        f"  vs persistence (temporal): {m['persistence']['margin_vs_stgcn_pct']:+.2f}%",
        f"  vs nearest_station (spatial): {m['nearest_station']['margin_vs_stgcn_pct']:+.2f}%",
        f"  vs IDW p={m['idw']['power']} (spatial)   : {m['idw']['margin_vs_stgcn_pct']:+.2f}%",
    ]
    if not gate["clears_threshold"]:
        lines.append(
            f"  HONEST CAVEAT: STGCN does not clearly beat trivial spatial "
            f"interpolation on this grid (margin vs IDW = "
            f"{gate['stgcn_vs_idw_margin_pct']:+.2f}%, threshold "
            f"{gate['threshold_pct']:.0f}%). See "
            f"notebooks/artifacts/spatial_baseline_metrics.json -> "
            f"metrics.idw_information_matched_diagnostic for why."
        )
    else:
        lines.append(
            f"  STGCN clears the spatial-baseline honesty threshold "
            f"({gate['stgcn_vs_idw_margin_pct']:+.2f}% >= {gate['threshold_pct']:.0f}%)."
        )
    return "\n".join(lines)


def main() -> int:
    print(heat_model_section())
    return 0


if __name__ == "__main__":
    sys.exit(main())
