const socket = new WebSocket("ws://localhost:8765");

socket.onopen = () => {
  console.log("Connected to Python WebSocket server");
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  console.log("Received packet:", data);

  /*
    Example:
    {
      time: 2.104,
      ecg: 0.7581,
      abp: 82.4,
      r_peak: true,
      bpm: 66,
      sbp: 122,
      dbp: 80
    }
  */
};

socket.onerror = (error) => {
  console.error("WebSocket error:", error);
};

socket.onclose = () => {
  console.log("WebSocket disconnected");
};

export default socket;