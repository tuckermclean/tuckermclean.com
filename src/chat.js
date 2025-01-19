import { AccessTokenEvents } from "oidc-client-ts";
import { envVars } from "/src/env.js";

envVars().then((ENV_VARS) => {
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
        targetConnectionId = data.connectionId;
    }
    if (data.type) {
      switch (data.type) {
        case "adminMessage":
        case "guestMessage":
            displayMessages(data);
            break;
        case "welcome":
            if (data.isAdmin) {
                data.message = "Welcome, admin!";
            } else {
                data.message = `Welcome, ${localStorage.getItem("name") || "user"}! Let us know how we can help.`;
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
        infoDiv.textContent = `[${new Date().toISOString()}] ${msg}`;
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
        text.textContent = message;

        div.appendChild(ts);
        div.appendChild(sender);
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

  // Focus the message box
  msgEl.focus();
});
