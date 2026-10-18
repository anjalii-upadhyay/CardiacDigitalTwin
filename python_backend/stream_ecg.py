from mat73 import loadmat
import numpy as np
import time

file_path = "../dataset/p000003.mat"

data = loadmat(file_path)
subj = data["Subj_Wins"]

ecg = np.array(subj["ECG_Record_F"][0]).flatten()
time_values = np.array(subj["T"][0]).flatten()
rpeaks = np.array(subj["ECG_RPeaks"][0]).flatten()

sampling_rate = 125  # Hz
delay = 1 / sampling_rate

print("Starting ECG stream...\n")

for i in range(len(ecg)):
    is_peak = i in rpeaks

    print({
        "time": round(float(time_values[i]), 3),
        "ecg": round(float(ecg[i]), 4),
        "r_peak": bool(is_peak)
    })

    time.sleep(delay)