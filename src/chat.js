import { AccessTokenEvents } from "oidc-client-ts";
import { envVars } from "/src/env.js";

envVars().then((ENV_VARS) => { while(true) {
    return new Promise((resolve, reject) => {
  // 1. Distinguish endpoints
  const wsUrl   = ENV_VARS.API_WS_BASE_URL;      // "wss://api-ws.example.com"
  const httpUrl = ENV_VARS.API_BASE_URL;    // "https://api.example.com"

  let wsUrlToken = wsUrl;
  let accessToken = null;
  let connectionId = null;
  let targetConnectionId = null;
  let isAdmin = false;

  // 2. Setup local storage for name/email/phone (if still wanted)
  const nameEl  = document.getElementById("name");
  const emailEl = document.getElementById("email");
  const phoneEl = document.getElementById("phone");

  [nameEl, emailEl, phoneEl].forEach((el) => {
    const storedVal = localStorage.getItem(el.id);
    if (storedVal) el.value = storedVal;
    el.addEventListener("input", () => {
      localStorage.setItem(el.id, el.value);
    });
  });

  if (localStorage.getItem("token")) {
    try {
        accessToken = JSON.parse(localStorage.getItem("token")).access_token;
        wsUrlToken = `${wsUrl}?accessToken=${accessToken}`;
        // At interval, check the access token and refresh if needed
        setInterval(() => {
            if (accessToken) {
                const token = JSON.parse(localStorage.getItem("token"));
                if (token.expires_at < (Date.now() - 60000)) {
                    refreshAccessToken().then((newToken) => {
                        accessToken = newToken;
                        console.log(`Token refreshed. New token expire time: ${JSON.parse(localStorage.getItem("token")).expires_at}`);
                    }).catch((err) => {
                        console.error("Error refreshing token:", err);
                    });
                } else {
                    console.log(`Token still valid. Expires in ${JSON.parse(localStorage.getItem("token")).expires_at - Date.now()} ms.`);
                }
            }
        }, 60000);

    } catch (err) {
        console.warn("No valid token found in localStorage.");
    }
  }

  // 3. Connect WebSocket (Receive-Only)
  displayMessages("Connecting WebSocket...");
  const socket = new WebSocket(wsUrlToken);

  socket.onopen = () => {
    displayMessages("WebSocket connected (receive only).");
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // The server might push { message }, or { action: 'connect' }, etc.
    if (data.connectionId) {
        if (targetConnectionId !== data.connectionId) {
            targetConnectionId = data.connectionId;
            if (isAdmin) {
                getConnections().then(displayConnections);
            }
        }
    }
    if (data.type) {
      switch (data.type) {
        case "noAdmins":
        case "adminMessage":
        case "guestMessage":
        case "newConnection":
        case "endConnection":
            displayMessages(data);
            break;
        case "welcome":
            if (data.isAdmin) {
                data.message = "Welcome, admin!";
                getConnections().then(displayConnections);
            } else {
                if (localStorage.getItem("name")) {
                    data.message = `Welcome, ${localStorage.getItem("name") || "user"}! Let us know how we can help.`;
                } else {
                    data.message = "Welcome! Enter your name down below! Let us know how we can help.";
                }
            }
            displayMessages(data);
            connectionId = data.connectionId;
            isAdmin = data.isAdmin;
            break;
        case "ping":
            socket.send(JSON.stringify({ ping: "pong" }));
            break;
        default:
            data.message = `Server action: ${data.type} ${data.message || ""}`;
            displayMessages(data);
      }
    } else if (data.message) {
        console.log(data, data.message === "Forbidden", !connectionId);
        if (data.message === "Forbidden" && !connectionId) {
            connectionId = data.connectionId;
            displayMessages(`Connection ID: ${connectionId}`);
        } else {
            displayMessages([data]);
        }
    } else if (data.error) {
        displayMessages(`Server error: ${data.message}`);
    } else {
      // Unknown
      displayMessages("Unknown WebSocket data:");
      displayMessages(data);
    }
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  socket.onclose = () => {
    displayMessages("WebSocket disconnected.");
    if (localStorage.getItem("token")) {
        refreshAccessToken().then((newToken) => {
            resolve(newToken);
        }).catch((err) => {
            console.error("Error refreshing token:", err);
            reject(err);
        });
    }
  };

  // 5. Send messages via HTTP
  const msgEl = document.getElementById("message");
  const sendBtn = document.getElementById("message-send");

  sendBtn.addEventListener("click", sendMessage);
  msgEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault();
      sendMessage();
    }
  });

  async function sendMessage() {
    const message = msgEl.value.trim();
    if (!message) {
      alert("Message cannot be empty.");
      return;
    }

    // Decide endpoint
    let endpoint = "message"; // default for guest
    const headers = { "Content-Type": "application/json" };

    if (accessToken) {
        // If logged in, use the token
        headers.Authorization = `Bearer ${accessToken}`;
        endpoint = "adminMessage";
    }

    // Build the request body
    // (If guest, you might include name/email/phone if the backend wants them)
    const payload = {
        message,
        name: localStorage.getItem("name") || undefined,
        email: localStorage.getItem("email") || undefined,
        phone: localStorage.getItem("phone") || undefined,
        connectionId,
        targetConnectionId,
    };

    try {
      msgEl.classList.add("waiting");
      const resp = await fetch(httpUrl + endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status} - ${text}`);
      }

      // Display your own message locally
      const newMsgObj = {
        message,
        timestamp: new Date().toISOString(),
        name: accessToken ? "Admin (You)" : "You",
      };
      displayMessages([newMsgObj]);
      msgEl.value = "";
    } catch (err) {
      console.error("Error sending message:", err);
      displayMessages(`Error sending message: ${err.message}`);
    } finally {
      msgEl.classList.remove("waiting");
    }
  }

  // 6. Utility: Display messages
  function displayMessages(messages) {
    if (!Array.isArray(messages)) messages = [messages];
    const container = document.getElementById("chat-messages");

    messages.forEach((msg) => {

      if (typeof msg === "string") {
        // Simple info string
        const infoDiv = document.createElement("div");
        infoDiv.classList.add("info");
        infoDiv.textContent = msg;
        const infoTs = document.createElement("span");
        infoTs.classList.add("timestamp");
        infoTs.textContent = `[${new Date().toISOString()}] `;
        infoDiv.prepend(infoTs);
        container.appendChild(infoDiv);
      } else {
        // Chat object
        const { timestamp, name, message, fromAdmin } = msg;
        const div = document.createElement("div");

        if (fromAdmin) {
            div.classList.add("from-admin");
        }

        const ts = document.createElement("span");
        ts.classList.add("timestamp");
        ts.textContent = `[${timestamp || new Date().toISOString()}] `;

        const sender = document.createElement("span");
        sender.classList.add("sender");
        sender.textContent = (name || "Anonymous") + ": ";

        const text = document.createElement("span");
        text.classList.add("message");
        if (msg.type === "newConnection") {
            text.textContent = `New connection: ${msg.connectionId}`;
        } else if (msg.type === "endConnection") {
            text.textContent = `Connection ended: ${msg.connectionId}`;
        } else if (msg.type === "noAdmins") {
            text.textContent = "Nobody is around to read your message at the moment. It will be stored for later delivery.";
        } else {
            text.textContent = message;
        }

        div.appendChild(ts);
        if (!["newConnection", "endConnection", "welcome", "noAdmins"].includes(msg.type)) {
            div.appendChild(sender);
        } else {
            if (isAdmin) {
                getConnections().then(displayConnections);
            }            
        }
        div.appendChild(text);
        container.appendChild(div);
      }
    });

    container.scrollTop = container.scrollHeight;
  }

  // 7. Optionally reset local storage
  function resetChat() {
    ["name", "email", "phone", "token"].forEach((key) => localStorage.removeItem(key));
    location.reload();
  }

  // Get list of connections (admin only)
  async function getConnections() {
    try {        
        if (!accessToken) {
            isAdmin = false;
            return;
        }

        // Decide endpoint
        const headers = { "Content-Type": "application/json" };

        if (accessToken) {
            // If logged in, use the token
            headers.Authorization = `Bearer ${accessToken}`;
            const connections = await fetch(httpUrl + "listConnections", { headers });
            isAdmin = true;
            return await connections.json();
        } else {
            isAdmin = false;
            return;
        }
    } catch (err) {
        console.error("Error getting connections:", err);
        isAdmin = false;
    }
  }

  function updateUserDivSpacing() {
    const usersDiv = document.querySelector('#chat-users');
    const messagesDiv = document.querySelector('#chat-messages');
    const computedWidth = usersDiv.offsetWidth; // Dynamically measure its width
    const computedHeight = messagesDiv.offsetHeight; // Dynamically measure its height
    document.documentElement.style.setProperty('--users-div-width', `${computedWidth}px`);
    document.documentElement.style.setProperty('--users-div-height', `${computedHeight}px`);
  }

    // Display list of connections (admin only)
    function displayConnections(connections) {
        if (!connections || !Array.isArray(connections)) {
            console.error("Invalid connections list:", connections);
            return;
        }
        const container = document.getElementById("chat-users");
        container.innerHTML = "";

        connections.forEach((conn) => {
            console.log(conn);
            const div = document.createElement("div");
            if (conn.connectionId === connectionId) {
                div.classList.add("you");
            }
            if (conn.connectionId === targetConnectionId) {
                div.classList.add("target");
            }
            if (conn.isAdmin) {
                div.classList.add("admin");
            }
            div.classList.add("user");
            div.textContent = conn.connectionId;
            div.addEventListener("click", (event) => {
                if (isAdmin) {
                    targetConnectionId = event.target.textContent;
                    displayMessages(`Now targeting connection: ${targetConnectionId}`);
                    getConnections().then(displayConnections);
                }
            });
            container.appendChild(div);
            container.classList.add("visible");
            updateUserDivSpacing();
        });
    }

    async function refreshAccessToken() {
        const refreshToken = JSON.parse(localStorage.getItem("token")).refresh_token;
        if (!refreshToken) {
          throw new Error("No refresh token available. Please log in again.");
        }
      
        const params = new URLSearchParams();
        params.append("grant_type", "refresh_token");
        params.append("client_id", ENV_VARS.COGNITO_CLIENT_ID);
        params.append("refresh_token", refreshToken);
      
        const response = await fetch(`https://auth.${ENV_VARS.DOMAIN_NAME}/oauth2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        });
      
        if (!response.ok) {
          throw new Error("Failed to refresh token");
        }
      
        const token = await response.json();
        // Update tokens in localStorage, note: some providers might not send a new refresh_token.
        token.expires_at = Date.now() + token.expires_in * 1000;
        localStorage.setItem('token', JSON.stringify({...token, refresh_token: refreshToken, expires_at: token.expires_in * 1000 + Date.now()}));
        return token.access_token;
      }
  // Focus the message box
  msgEl.focus();
});
}});
