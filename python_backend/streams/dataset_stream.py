"""Dataset loading and per-window signal extraction."""

import numpy as np
from mat73 import loadmat

DATASET_PATH = "../dataset/p000003.mat"


def load_dataset(path: str = DATASET_PATH):
    """
    Load the .mat dataset and return the subject windows struct.
    Returns (subj, sbp_all, dbp_all, n_windows).
    """
    data    = loadmat(path)
    subj    = data["Subj_Wins"]
    sbp_all = np.array(subj["SegSBP"]).flatten()
    dbp_all = np.array(subj["SegDBP"]).flatten()
    return subj, sbp_all, dbp_all, len(sbp_all)


def get_window_signals(subj, win_idx: int):
    """
    Extract raw signals for a single window.
    Returns (ecg, t_vals, rpeaks, abp_w, rpeak_indices, bpm).
    """
    ecg    = np.array(subj["ECG_Record_F"][win_idx]).flatten()
    t_vals = np.array(subj["T"][win_idx]).flatten()
    rpeaks = np.array(subj["ECG_RPeaks"][win_idx]).flatten()
    abp_w  = np.array(subj["ABP_Raw"][win_idx]).flatten()

    rpeak_indices = {int(x) for x in rpeaks if not np.isnan(x)}

    if len(rpeaks) >= 2:
        duration = float(t_vals[-1] - t_vals[0])
        bpm = int(round((len(rpeaks) / duration) * 60)) if duration > 0 else 72
    else:
        bpm = 72

    return ecg, t_vals, rpeaks, abp_w, rpeak_indices, bpm
