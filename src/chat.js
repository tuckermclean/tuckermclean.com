import { envVars } from "/src/env.js";

class Chat {
    constructor() {
        this.accessToken = null;
        this.connectionId = null;
        this.targetConnectionId = null;
        this.isAdmin = false;
        this.nameEl = document.getElementById("name");
        this.emailEl = document.getElementById("email");
        this.phoneEl = document.getElementById("phone");
        this.msgEl = document.getElementById("message");
        this.sendBtn = document.getElementById("message-send");
        this.socket = null;
        this.abortController = new AbortController();
        this.promise = new Promise((resolve, reject, that = this) => {
            that.resolve = resolve;
            that.reject = () => {
                that.abortController.abort();
                reject;
            };
        });
        envVars().then((envVars, that=this) => {
            that.ENV_VARS = envVars;
            that.wsUrl = that.ENV_VARS.API_WS_BASE_URL;
            that.httpUrl = that.ENV_VARS.API_BASE_URL;
            that.wsUrlToken = that.wsUrl;
            that.init();
        });
    }

    async init() {
        // Event handler for abort controller
        this.abortController.signal.addEventListener("abort", () => {
            this.socket.close();
        });
        [this.nameEl, this.emailEl, this.phoneEl].forEach((el) => {
    const storedVal = localStorage.getItem(el.id);
    if (storedVal) el.value = storedVal;
    el.addEventListener("input", () => {
      localStorage.setItem(el.id, el.value);
    });
  });

  if (localStorage.getItem("token")) {
    try {
        this.accessToken = JSON.parse(localStorage.getItem("token")).access_token;
        this.wsUrlToken = `${this.wsUrl}?accessToken=${this.accessToken}`;
        // At interval, check the access token and refresh if needed
        setInterval(() => {
            if (this.accessToken) {
                const token = JSON.parse(localStorage.getItem("token"));
                if (token.expires_at < (Date.now() - 60000)) {
                    this.refreshAccessToken().then((newToken) => {
                        this.accessToken = newToken;
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

  // 3. Connect WebSocket
  this.displayMessages("Connecting WebSocket...");
  this.socket = new WebSocket(this.wsUrlToken);

  this.socket.onopen = () => {
    this.displayMessages("WebSocket connected.");
  };

  this.socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // The server might push { message }, or { action: 'connect' }, etc.
    if (data.connectionId) {
        if (this.targetConnectionId !== data.connectionId && data.connectionId !== this.connectionId) {
            this.targetConnectionId = data.connectionId;
            if (this.isAdmin) {
                this.updateConnections();
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
        case "visitorNotFound":
            this.displayMessages(data);
            break;
        case "welcome":
            if (data.isAdmin) {
                data.message = "Welcome, admin!";
                this.updateConnections();
            } else {
                if (localStorage.getItem("name")) {
                    data.message = `Welcome, ${localStorage.getItem("name") || "user"}! Let us know how we can help.`;
                } else {
                    data.message = "Welcome! Enter your name down below! Let us know how we can help.";
                }
            }
            this.displayMessages(data);
            this.connectionId = data.connectionId;
            this.isAdmin = data.isAdmin;
            break;
        case "ping":
            this.socket.send(JSON.stringify({ ping: "pong" }));
            break;
        default:
            data.message = `Server action: ${data.type} ${data.message || ""}`;
            this.displayMessages(data);
      }
    } else if (data.message) {
        console.log(data, data.message === "Forbidden", !this.connectionId);
        if (data.message === "Forbidden" && !this.connectionId) {
            this.connectionId = data.connectionId;
            this.displayMessages(`Connection ID: ${connectionId}`);
        } else {
            this.displayMessages([data]);
        }
    } else if (data.error) {
        this.displayMessages(`Server error: ${data.message}`);
    } else {
      // Unknown
      this.displayMessages("Unknown WebSocket data:");
      this.displayMessages(data);
    }
  };

  this.socket.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  this.socket.onclose = () => {
    this.displayMessages("WebSocket disconnected.");
    if (localStorage.getItem("token")) {
        this.refreshAccessToken().then((newToken) => {
            this.accessToken = newToken;
            console.log(`Token refreshed. New token expire time: ${JSON.parse(localStorage.getItem("token")).expires_at}`);
        }).catch((err) => {
            console.error("Error refreshing token:", err);
            this.isAdmin = false;
            this.displayMessages("Error refreshing token. Please log in again.");
            this.reject(err);
        });
    }
  };

  this.sendBtn.addEventListener("click", () => { this.sendMessage() });
  this.msgEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault();
      this.sendMessage();
    }
  });

  this.msgEl.focus();
  }
  // end init()

  async sendMessage() {
    const message = this.msgEl.value.trim();
    if (!message) {
      alert("Message cannot be empty.");
      return;
    }

    // Decide endpoint
    let endpoint = "message"; // default for guest
    const headers = { "Content-Type": "application/json" };

    if (this.isAdmin) {
        // If authorized, use the token
        headers.Authorization = `Bearer ${this.accessToken}`;
        endpoint = "adminMessage";
    }

    // Build the request body
    // (If guest, you might include name/email/phone if the backend wants them)
    const payload = {
        message,
        name: localStorage.getItem("name") || undefined,
        email: localStorage.getItem("email") || undefined,
        phone: localStorage.getItem("phone") || undefined,
        connectionId: this.connectionId,
        targetConnectionId: this.targetConnectionId,
    };

    try {
      this.msgEl.classList.add("waiting");
      const resp = await fetch(this.httpUrl + endpoint, {
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
        name: this.accessToken ? "Admin (You)" : "You",
      };
      this.displayMessages([newMsgObj]);
      this.msgEl.value = "";
    } catch (err) {
      console.error("Error sending message:", err);
      this.displayMessages(`Error sending message: ${err.message}`);
    } finally {
      this.msgEl.classList.remove("waiting");
    }
  }

  // 6. Utility: Display messages
displayMessages(messages) {
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
        } else if (msg.type === "visitorNotFound") {
            text.textContent = "Visitor not found: "+msg.targetConnectionId;
        } else {
            text.textContent = message;
        }

        div.appendChild(ts);
        if (!["newConnection", "endConnection", "welcome", "noAdmins"].includes(msg.type)) {
            div.appendChild(sender);
        } else {
            if (this.isAdmin) {
                this.updateConnections();
            }            
        }
        div.appendChild(text);
        container.appendChild(div);
      }
    });

    container.scrollTop = container.scrollHeight;
  }

  // 7. Optionally reset local storage
  resetChat() {
    ["name", "email", "phone", "token"].forEach((key) => localStorage.removeItem(key));
    this.socket.close();
    //location.reload();
  }

  // Get list of connections (admin only)
  async getConnections() {
    try {        
        if (!this.accessToken) {
            this.isAdmin = false;
            return;
        }

        // Decide endpoint
        const headers = { "Content-Type": "application/json" };

        if (this.accessToken) {
            // If logged in, use the token
            headers.Authorization = `Bearer ${this.accessToken}`;
            const connections = await fetch(this.httpUrl + "listConnections", { headers });
            this.isAdmin = true;
            return await connections.json();
        } else {
            this.isAdmin = false;
            return;
        }
    } catch (err) {
        console.error("Error getting connections:", err);
        this.isAdmin = false;
    }
  }

  updateUserDivSpacing() {
    const usersDiv = document.querySelector('#chat-users');
    const messagesDiv = document.querySelector('#chat-messages');
    const computedWidth = usersDiv.offsetWidth; // Dynamically measure its width
    const computedHeight = messagesDiv.offsetHeight; // Dynamically measure its height
    document.documentElement.style.setProperty('--users-div-width', `${computedWidth}px`);
    document.documentElement.style.setProperty('--users-div-height', `${computedHeight}px`);
    // If users div is visible:
    if (usersDiv.classList.contains('visible')) {
      messagesDiv.classList.add('users-visible');
    } else {
      messagesDiv.classList.remove('users-visible');
    }
  }


  updateConnections() {
    const that = this;
    this.getConnections().then(
        (connections) => {
            that.displayConnections(connections, that);
        });
  }

    // Display list of connections (admin only)
    displayConnections(connections, that) {
        if (!connections || !Array.isArray(connections)) {
            console.error("Invalid connections list:", connections);
            return;
        }
        const container = document.getElementById("chat-users");
        container.innerHTML = "";

        connections.forEach((conn) => {
            console.log(conn);
            const div = document.createElement("div");
            if (conn.connectionId === that.connectionId) {
                div.classList.add("you");
            }
            if (conn.connectionId === that.targetConnectionId) {
                div.classList.add("target");
            }
            if (conn.isAdmin) {
                div.classList.add("admin");
            }
            div.classList.add("user");
            div.textContent = conn.connectionId;
            div.addEventListener("click", (event) => {
                if (that.isAdmin) {
                    that.targetConnectionId = event.target.textContent;
                    that.displayMessages(`Now targeting connection: ${that.targetConnectionId}`);
                    that.updateConnections();
                }
            });
            container.appendChild(div);
            container.classList.add("visible");
            that.updateUserDivSpacing();
        });
    }

    async refreshAccessToken() {
        const refreshToken = JSON.parse(localStorage.getItem("token")).refresh_token;
        if (!refreshToken) {
          throw new Error("No refresh token available. Please log in again.");
        }
      
        const params = new URLSearchParams();
        params.append("grant_type", "refresh_token");
        params.append("client_id", this.ENV_VARS.COGNITO_CLIENT_ID);
        params.append("refresh_token", refreshToken);
      
        const response = await fetch(`https://auth.${this.ENV_VARS.DOMAIN_NAME}/oauth2/token`, {
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
}

export { Chat };

(async function mainLoop() {
    while (true) {
        try {
            const chat = new Chat();
            await chat.promise; // Wait for the promise to resolve before continuing
        } catch (err) {
            console.error("An error occurred in Chat:", err);
        }
    }
})();
