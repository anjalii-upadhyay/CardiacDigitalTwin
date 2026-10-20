"""
Step 3.1: compute the feature table (artifacts/features.csv) from all downloaded slices.
Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.ml_training.scripts.build_features
"""

import numpy as np

from hf_twin.ml_training import dataset, features


def main():
    rows = dataset.build_table()
    dataset.save_table(rows)
    usable = [r for r in rows if r["clean_set"] and r["signal_ok"]]
    print(f"recordings: {len(rows)} | clean and signal OK: {len(usable)} "
          f"from {len({r['patient_id'] for r in usable})} patients")
    print(f"{'feature':<22}{'missing':>8}{'median':>10}{'min':>10}{'max':>10}")
    for name in features.SIGNAL_FEATURES + features.RECORD_FEATURES:
        v = np.array([r[name] for r in usable], dtype=float)
        ok = v[np.isfinite(v)]
        print(f"{name:<22}{int(np.sum(~np.isfinite(v))):>8}"
              f"{(np.median(ok) if ok.size else np.nan):>10.2f}{(ok.min() if ok.size else np.nan):>10.2f}"
              f"{(ok.max() if ok.size else np.nan):>10.2f}")
    print(f"wrote {dataset.TABLE_CSV}")


if __name__ == "__main__":
    main()
