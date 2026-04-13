import asyncio
import json
import websockets

async def check():
    async with websockets.connect('ws://localhost:8765') as ws:
        for i in range(30):
            msg = await ws.recv()
            p = json.loads(msg)
            print(f"packet {i+1:2d} | bpm:{p['bpm']} | abp:{p['abp']:7.2f} | sbp:{p['sbp']:6.1f} | r_peak:{p['r_peak']}")

asyncio.run(check())
