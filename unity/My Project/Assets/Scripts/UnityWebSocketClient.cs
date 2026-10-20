using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using NativeWebSocket;
using UnityEngine;

/// <summary>
/// Receives JSON physiological packets from the Python backend and forwards them
/// to HeartStateManager. Does not manipulate simulation systems directly.
/// </summary>
[DefaultExecutionOrder(-100)]
public class UnityWebSocketClient : MonoBehaviour
{
    [Header("Connection")]
    [SerializeField] string serverUrl = "ws://localhost:8765";
    [SerializeField] bool autoConnectOnStart = true;
    [SerializeField] float reconnectDelaySeconds = 3f;

    [Header("Integration")]
    [SerializeField] HeartStateManager stateManager;

    WebSocket webSocket;
    readonly ConcurrentQueue<string> incomingMessages = new ConcurrentQueue<string>();

    bool isConnecting;
    bool isClosing;
    bool reconnectScheduled;
    bool isShuttingDown;

    public bool IsConnected =>
        webSocket != null && webSocket.State == WebSocketState.Open;

    public string ConnectionState =>
        webSocket == null ? "Disconnected" : webSocket.State.ToString();

    async void Start()
    {
        if (!CanRunLifecycle())
        {
            return;
        }

        if (stateManager == null)
        {
            stateManager = FindFirstObjectByType<HeartStateManager>();
        }

        if (autoConnectOnStart)
        {
            await ConnectAsync();
        }
    }

    void Update()
    {
        if (!CanRunLifecycle())
        {
            return;
        }

#if !UNITY_WEBGL || UNITY_EDITOR
        if (webSocket != null)
        {
            webSocket.DispatchMessageQueue();
        }
#endif

        while (incomingMessages.TryDequeue(out string json))
        {
            ProcessMessage(json);
        }
    }

    void OnApplicationQuit()
    {
        BeginShutdown();
    }

    void OnDisable()
    {
        if (!Application.isPlaying)
        {
            BeginShutdown();
        }
    }

    void OnDestroy()
    {
        BeginShutdown();
    }

    public async Task ConnectAsync()
    {
        if (!CanRunLifecycle() || isConnecting || IsConnected)
        {
            return;
        }

        isConnecting = true;

        try
        {
            CleanupWebSocketHandlers();

            webSocket = new WebSocket(serverUrl);
            webSocket.OnOpen += OnWebSocketOpen;
            webSocket.OnError += OnWebSocketError;
            webSocket.OnClose += OnWebSocketClose;
            webSocket.OnMessage += OnWebSocketMessage;

            Debug.Log($"[WebSocket] Connecting to {serverUrl}...");
            await webSocket.Connect();
        }
        catch (Exception exception)
        {
            if (CanRunLifecycle())
            {
                Debug.LogWarning($"[WebSocket] Connect failed: {exception.Message}");
                ScheduleReconnect();
            }
        }
        finally
        {
            isConnecting = false;
        }
    }

    public async Task DisconnectAsync()
    {
        if (isClosing)
        {
            return;
        }

        isClosing = true;
        CancelReconnect();

        if (webSocket == null)
        {
            isClosing = false;
            return;
        }

        WebSocket socket = webSocket;
        CleanupWebSocketHandlers();
        webSocket = null;

        try
        {
            if (socket.State == WebSocketState.Open ||
                socket.State == WebSocketState.Connecting)
            {
                await socket.Close();
            }
        }
        catch (Exception exception)
        {
            if (!isShuttingDown)
            {
                Debug.LogWarning($"[WebSocket] Disconnect warning: {exception.Message}");
            }
        }
        finally
        {
            isClosing = false;

            if (!isShuttingDown)
            {
                Debug.Log("[WebSocket] Disconnected.");
            }
        }
    }

    void OnWebSocketOpen()
    {
        if (!CanRunLifecycle())
        {
            return;
        }

        reconnectScheduled = false;
        Debug.Log($"[WebSocket] Connected ({ConnectionState})");
    }

    void OnWebSocketError(string errorMessage)
    {
        if (!CanRunLifecycle())
        {
            return;
        }

        Debug.LogWarning($"[WebSocket] Error: {errorMessage}");
    }

    void OnWebSocketClose(WebSocketCloseCode closeCode)
    {
        if (!CanRunLifecycle())
        {
            return;
        }

        if (!isShuttingDown)
        {
            Debug.Log($"[WebSocket] Closed ({closeCode}) state={ConnectionState}");
        }

        if (!isClosing)
        {
            ScheduleReconnect();
        }
    }

    void OnWebSocketMessage(byte[] data)
    {
        if (!CanRunLifecycle() || data == null || data.Length == 0)
        {
            return;
        }

        string json = System.Text.Encoding.UTF8.GetString(data);
        incomingMessages.Enqueue(json);
    }

    void ProcessMessage(string json)
    {
        if (!CanRunLifecycle() || string.IsNullOrWhiteSpace(json))
        {
            return;
        }

        try
        {
            HeartPacket packet = JsonUtility.FromJson<HeartPacket>(json);
            if (packet == null || !packet.IsValid())
            {
                Debug.LogWarning("[WebSocket] Received invalid packet JSON.");
                return;
            }

            if (stateManager == null)
            {
                stateManager = FindFirstObjectByType<HeartStateManager>();
            }

            if (stateManager == null)
            {
                Debug.LogWarning("[WebSocket] HeartStateManager not found.");
                return;
            }

            stateManager.ApplyPacket(packet);
        }
        catch (Exception exception)
        {
            Debug.LogWarning($"[WebSocket] Failed to parse packet: {exception.Message}");
        }
    }

    void ScheduleReconnect()
    {
        if (!CanRunLifecycle() || isClosing || reconnectScheduled)
        {
            return;
        }

        reconnectScheduled = true;
        Debug.Log($"[WebSocket] Reconnecting in {reconnectDelaySeconds:F1}s...");
        Invoke(nameof(Reconnect), reconnectDelaySeconds);
    }

    async void Reconnect()
    {
        reconnectScheduled = false;

        if (!CanRunLifecycle() || isClosing)
        {
            return;
        }

        await ConnectAsync();
    }

    void BeginShutdown()
    {
        if (isShuttingDown)
        {
            return;
        }

        isShuttingDown = true;
        CancelReconnect();
        CleanupWebSocketHandlers();
        webSocket = null;
    }

    void CancelReconnect()
    {
        reconnectScheduled = false;
        CancelInvoke(nameof(Reconnect));
    }

    void CleanupWebSocketHandlers()
    {
        if (webSocket == null)
        {
            return;
        }

        webSocket.OnOpen -= OnWebSocketOpen;
        webSocket.OnError -= OnWebSocketError;
        webSocket.OnClose -= OnWebSocketClose;
        webSocket.OnMessage -= OnWebSocketMessage;
    }

    bool CanRunLifecycle()
    {
        return !isShuttingDown && isActiveAndEnabled;
    }
}
