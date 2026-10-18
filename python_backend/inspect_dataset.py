from mat73 import loadmat
import matplotlib.pyplot as plt
import numpy as np

file_path = "../dataset/p000003.mat"

data = loadmat(file_path)
subj = data["Subj_Wins"]

ecg = np.array(subj["ECG_Record_F"][0]).flatten()
time = np.array(subj["T"][0]).flatten()
rpeaks = np.array(subj["ECG_RPeaks"][0]).flatten()

print("ECG length:", len(ecg))
print("R-peak length:", len(rpeaks))
print("R-peaks:")
print(rpeaks)

plt.figure(figsize=(12, 4))
plt.plot(time, ecg, label="ECG")

for peak in rpeaks:
    if int(peak) < len(time):
        plt.axvline(time[int(peak)], color="red", linestyle="--", alpha=0.7)

plt.title("ECG with R-Peaks")
plt.xlabel("Time")
plt.ylabel("Amplitude")
plt.grid(True)
plt.legend()
plt.show()