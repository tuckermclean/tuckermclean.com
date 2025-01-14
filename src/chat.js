import { envVars } from '/src/env.js';
envVars().then((ENV_VARS) => {
    let targetConnectionId = null;

    const apiBaseUrl = ENV_VARS.API_BASE_URL;
    const socket = new WebSocket(apiBaseUrl);
    let isAdmin = false;

    if (!socket) {
        alert("Your browser does not support WebSockets. Please use a modern browser.");
    }

    // Set up Enter key to send message
    document.getElementById("message").addEventListener("keydown", (event) => {
        // If the key is Enter but without any modifiers, send the message
        if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    document.getElementById("message-send").addEventListener("click", sendMessage);

    function updateInputs() {
        if (document.getElementById("name").value && document.getElementById("name").value !== "") {
            localStorage.setItem("name", document.getElementById("name").value);
            socket.send(JSON.stringify({ action: "set", key: "fullName", value: document.getElementById("name").value }));
        }
        if (document.getElementById("email").value && document.getElementById("email").value !== "") {
            localStorage.setItem("email", document.getElementById("email").value);
            socket.send(JSON.stringify({ action: "set", key: "email", value: document.getElementById("email").value }));
        }
        if (document.getElementById("phone").value && document.getElementById("phone").value !== "") {
            localStorage.setItem("phone", document.getElementById("phone").value);
            socket.send(JSON.stringify({ action: "set", key: "phone", value: document.getElementById("phone").value }));
        }
    }
    // If user types in name, email, or phone, save it to local storage
    document.getElementById("name").addEventListener("input", updateInputs);
    document.getElementById("email").addEventListener("input", updateInputs);
    document.getElementById("phone").addEventListener("input", updateInputs);
    document.getElementById("name").addEventListener("focus", updateInputs);
    document.getElementById("email").addEventListener("focus", updateInputs);
    document.getElementById("phone").addEventListener("focus", updateInputs);

    const name = localStorage.getItem("name");
    const email = localStorage.getItem("email");
    const phone = localStorage.getItem("phone");

    if (name) {
        document.getElementById("name").value = name;
    }
    if (email) {
        document.getElementById("email").value = email;
    }
    if (phone) {
        document.getElementById("phone").value = phone;
    }

    socket.onopen = (event) => {
        displayMessages("Connected to chat server.");
        let accessToken;
        try {
            accessToken = JSON.parse(localStorage.getItem("token")).access_token;
            if (!accessToken) {
                updateInputs();
            } else {
                socket.send(JSON.stringify({ action: "authenticate", accessToken }));
            }
        } catch (error) {
            console.error("Not able to authenticate:", error);
            updateInputs();
        }
    };

    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.response) {
            if (msg.response === "authenticate") {
                displayMessages("Authenticated with chat server.");
                updateInputs();
                socket.send(JSON.stringify({ action: "listConnections" }));
                isAdmin = true;
            } else if (msg.response === "listConnections") {
                const users = msg.connections;
                const usersDiv = document.getElementById("chat-users");
                usersDiv.innerHTML = "";
                users.forEach((user) => {
                    const userDiv = document.createElement("div");
                    userDiv.classList.add("user");
                    userDiv.textContent = user.fullName || user.name || user.email || user.phone || user.connectionId;
                    userDiv.onclick = () => {
                        targetConnectionId = user.connectionId;
                        console.log("Target connection ID:", targetConnectionId);
                    };
                    // Check if the user is an admin
                    if (user.isAdmin) {
                        userDiv.classList.add("admin");
                    }
                    usersDiv.appendChild(userDiv);
                });
                usersDiv.classList.add("visible");
            } else if (msg.response === "sendMessage") {
                // Select any element with a class of "waiting" and remove the class
                document.querySelectorAll(".waiting").forEach((element) => {
                    element.classList.remove("waiting");
                });
            } else {
                console.log("Info:", msg);
            }
        } else if (msg.action) {
            if (msg.action === "connect" || msg.action === "disconnect") {
                socket.send(JSON.stringify({ action: "listConnections" }));
                const connectMessage = document.createElement("div");
                connectMessage.appendChild(document.createTextNode('User '));
                const userSpan = document.createElement("span");
                userSpan.textContent = msg.connectionId;
                userSpan.classList.add("user");
                userSpan.onclick = () => {
                    targetConnectionId = msg.connectionId;
                    console.log("Target connection ID:", targetConnectionId);
                };
                connectMessage.appendChild(userSpan);
                connectMessage.appendChild(document.createTextNode(` ${msg.action === "disconnect" ? "dis" : ""}connected.`));
                document.getElementById("chat-messages").appendChild(connectMessage);
            } else if (msg.action === "ping") {
                socket.send(JSON.stringify({ action: "pong" }));
                console.log("Ping Pong");
            } else {
                displayMessages("Unknown action");
                displayMessages([msg]);
            }
        } else if (msg.error) {
            if (msg.error === "authenticate") {
                // If not authenticated, display a message to login.
                // Construct a link to login page
                const loginLink = document.createElement("a");
                loginLink.href = "/login.html";
                loginLink.textContent = "Login again";
                // Include the link in the message
                displayMessages("Login info has expired. ");
                // Append the link to the last message
                document.getElementById("chat-messages").lastChild.appendChild(loginLink);
            } else {
                displayMessages(`Error: ${msg.message}`);
                // Select any element with a class of "waiting" and remove the class
                document.querySelectorAll(".waiting").forEach((element) => {
                    element.classList.remove("waiting");
                });
            }
        } else if (msg.message) {
            displayMessages([msg]);
            // If is admin, get list of connections
            if (isAdmin) {
                socket.send(JSON.stringify({ action: "listConnections" }));
            }
        } else {
            displayMessages("Unknown message");
            displayMessages([msg]);
        }
    };

    socket.onclose = (event) => {
        displayMessages("Disconnected from chat server.");
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
    };

    function displayMessages(messages) {
        const messagesContainer = document.getElementById("chat-messages");

        try {
            if (typeof messages === "string") {
                messages = [JSON.parse(messages)];
            }
        } catch (error) {
            // If the message is not JSON, just display it as a string
        }

        try {
            if (typeof messages === "string") {
                const messageDiv = document.createElement("div");
                const timestamp = document.createElement("span");
                timestamp.classList.add("timestamp");
                timestamp.textContent = `[${new Date().toISOString()}] `;
                messageDiv.appendChild(timestamp);
                const message = document.createElement("span");
                message.textContent = messages;
                message.classList.add("info");
                message.classList.add("message");
                messageDiv.appendChild(message);
                messagesContainer.appendChild(messageDiv);
            } else {
                messages.forEach((msg) => {
                    msg.timestamp = msg.timestamp || new Date().toISOString();
                    // If message with same content and timestamp is already displayed, skip it
                    if (messagesContainer.lastChild && messagesContainer.lastChild.textContent === `[${msg.timestamp}] ${msg.message}`) {
                        return;
                    }
                    const messageDiv = document.createElement("div");
                    const senderInfo = msg.fullName || msg.name || msg.email || msg.phone || "Anonymous";
                    const messageParts = [
                        document.createElement("span"),
                        document.createElement("span"),
                        document.createElement("span"),
                    ];

                    messageParts[0].classList.add("timestamp");
                    messageParts[1].classList.add("sender");
                    messageParts[1].classList.add("user");
                    messageParts[2].classList.add("message");

                    messageParts[0].textContent = `[${msg.timestamp}] `;
                    messageParts[1].textContent = `${senderInfo}: `;
                    messageParts[2].textContent = msg.message;

                    messageParts[1].onclick = () => {
                        targetConnectionId = msg.from || senderInfo || null;
                        console.log("Target connection ID:", targetConnectionId);
                    };

                    messageParts.forEach((part) => {
                        messageDiv.appendChild(part);
                    });

                    if (msg.fromAdmin) {
                        messageDiv.classList.add("from-admin");
                    } else {
                        if (msg.from) {
                            targetConnectionId = msg.from;
                        }
                    }
                    messagesContainer.appendChild(messageDiv);
                });
            }
        } catch (error) {
            console.error("Error displaying messages:", error);
        }

        // Scroll to the bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async function sendMessage() {
        const message = document.getElementById("message").value;

        if (!message) {
            alert("Message cannot be empty.");
            return;
        }

        const payload = {
            action: "sendMessage",
            message,
        };

        if (targetConnectionId) {
            payload.targetConnectionId = targetConnectionId;
        }

        try {
            // While sending, add class to message textarea of "waiting"
            document.getElementById("message").classList.add("waiting");
            socket.send(JSON.stringify(payload));
            if (isAdmin) {
                displayMessages([{fromAdmin: isAdmin, message, name: targetConnectionId, timestamp: new Date().toISOString() }]);
            } else {
                displayMessages([{fromAdmin: isAdmin, message, name: "You", timestamp: new Date().toISOString() }]);
            }
            // Add class "waiting" to last message to indicate it is waiting for a response
            document.getElementById("chat-messages").lastChild.classList.add("waiting");
            document.getElementById("message").value = "";
        } catch (error) {
            console.error("Error sending message:", error);
        }
    }

    function resetChat(reload = true) {
        localStorage.removeItem("conversationUuid");
        localStorage.removeItem("authHeader");
        localStorage.removeItem("vapidPublicKey");
        localStorage.removeItem("name");
        localStorage.removeItem("email");
        localStorage.removeItem("phone");
        localStorage.removeItem("adminConversationUuid");
        localStorage.removeItem("adminAuthHeader");
        conversationUuid = undefined;
        authHeader = undefined;
        vapidPublicKey = undefined;
        if (reload) {
            location.reload();
        }
    }

    // Set focus to the message textarea
    document.getElementById("message").focus();
    window.windowCleanup["chat"] = () => {
        clearInterval(window.intervals["chat"]);
        delete window.intervals["chat"];
    };
});