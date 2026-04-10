# websocket_server.py

import asyncio
import json
import numpy as np
import websockets
from mat73 import loadmat

# Load Dataset
file_path = "../dataset/p000003.mat"

data = loadmat(file_path)
subj = data["Subj_Wins"]

# ECG
ecg = np.array(subj["ECG_Record_F"][0]).flatten()
time_values = np.array(subj["T"][0]).flatten()
rpeaks = np.array(subj["ECG_RPeaks"][0]).flatten()

# Blood Pressure Labels
sbp = float(subj["SegSBP"][0])
dbp = float(subj["SegDBP"][0])

# Optional ABP waveform
abp = np.array(subj["ABP_Raw"][0]).flatten()

# Sampling rate
sampling_rate = 125
delay = 1 / sampling_rate

# Convert R-peak indices into integers
rpeak_indices = set(int(x) for x in rpeaks)

# Calculate BPM
heart_rate_bpm = int((len(rpeaks) / (time_values[-1] - time_values[0])) * 60)

print(f"BPM: {heart_rate_bpm}")
print(f"SBP: {sbp}")
print(f"DBP: {dbp}")

# WebSocket Handler
async def stream_data(websocket):
    print("Client connected")

    for i in range(len(ecg)):
        packet = {
            "time": round(float(time_values[i]), 3),
            "ecg": round(float(ecg[i]), 4),
            "abp": round(float(abp[i]), 2),
            "r_peak": i in rpeak_indices,
            "bpm": heart_rate_bpm,
            "sbp": round(sbp, 1),
            "dbp": round(dbp, 1)
        }

        await websocket.send(json.dumps(packet))
        await asyncio.sleep(delay)

    print("Finished streaming")

# Start Server
async def main():
    server = await websockets.serve(stream_data, "0.0.0.0", 8765)
    print("WebSocket server running on ws://localhost:8765")
    await server.wait_closed()

asyncio.run(main())