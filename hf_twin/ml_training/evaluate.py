"""
Honest evaluation: every prediction comes from a model that never saw that patient.

Outer loop: patients are split into 10 groups; each group is held out in turn (a patient's recordings are
always held out together, so no patient is ever in both training and testing).
Inner loop: the model's settings are tuned with 5-fold patient-grouped cross-validation on the rest.
"""

import numpy as np
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GridSearchCV, GroupKFold

from hf_twin.ml_training import config, models

OUTER_FOLDS = 10


def out_of_fold_predictions(X, y, groups, model_name, seed=config.RANDOM_SEED, test_mask=None):
    """
    Predict every recording with a model trained (and tuned) without that recording's patient.
    test_mask: rows that may be predicted and scored. Rows outside it (e.g. after-medicine slices) are only
    ever used for training, and always stay in the same fold as the rest of their patient.
    """
    pred = np.full(len(y), np.nan)
    chosen = []
    if test_mask is None:
        test_mask = np.ones(len(y), dtype=bool)
    n_outer = min(OUTER_FOLDS, len(set(groups)))
    outer = GroupKFold(n_splits=n_outer, shuffle=True, random_state=seed)
    for train, test in outer.split(X, y, groups):
        test = test[test_mask[test]]
        if len(test) == 0:
            continue
        pipe, grid = models.make(model_name, float(np.std(y[train])))
        if grid:
            n_inner = min(5, len(set(groups[train])))
            search = GridSearchCV(pipe, grid, cv=GroupKFold(n_splits=n_inner), scoring="neg_mean_absolute_error",
                                  n_jobs=-1)
            search.fit(X[train], y[train], groups=groups[train])
            pred[test] = search.predict(X[test])
            chosen.append(search.best_params_)
        else:
            pipe.fit(X[train], y[train])
            pred[test] = pipe.predict(X[test])
    return pred, chosen


def summary(y, pred):
    err = pred - y
    r = float(np.corrcoef(y, pred)[0, 1]) if np.std(pred) > 0 else float("nan")
    return {"mae": float(np.mean(np.abs(err))), "rmse": float(np.sqrt(np.mean(err ** 2))), "pearson_r": r,
            "r2": float(1 - np.sum(err ** 2) / np.sum((y - np.mean(y)) ** 2))}


def bootstrap_mae_gain(y, pred_model, pred_naive, groups, n_boot=2000, seed=config.RANDOM_SEED):
    """
    How much lower the model's average error is than the naive guess, with a 95% interval.
    Resamples whole patients, so repeated recordings of one patient are never split.
    """
    rng = np.random.default_rng(seed)
    pats = np.unique(groups)
    idx_by_pat = {p: np.where(groups == p)[0] for p in pats}
    gain = np.mean(np.abs(pred_naive - y)) - np.mean(np.abs(pred_model - y))
    boots = []
    for _ in range(n_boot):
        idx = np.concatenate([idx_by_pat[p] for p in rng.choice(pats, size=len(pats), replace=True)])
        boots.append(np.mean(np.abs(pred_naive[idx] - y[idx])) - np.mean(np.abs(pred_model[idx] - y[idx])))
    lo, hi = np.percentile(boots, [2.5, 97.5])
    return {"mae_gain_mmHg_or_mL": float(gain), "ci95_low": float(lo), "ci95_high": float(hi),
            "meets_success_rule": bool(lo > 0)}


def auroc(scores, labels):
    """How well a continuous score separates two groups (0.5 = coin flip, 1.0 = perfect). No cut-off needed."""
    ok = np.isfinite(scores) & np.isfinite(labels)
    if len(set(labels[ok])) < 2:
        return float("nan")
    return float(roc_auc_score(labels[ok], scores[ok]))
