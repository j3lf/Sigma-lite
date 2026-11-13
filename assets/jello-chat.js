(() => {
    const chatInput = document.getElementById("chatInput");
    const chatMessages = document.getElementById("chatMessages");
    const chatStatus = document.getElementById("chatStatus");
    const sendButton = document.getElementById("sendButton");
    const onlineCount = document.getElementById("onlineCount");
    const onlineUserList = document.getElementById("onlineUserList");
    const configuredURL = document.querySelector('meta[name="jello-chat-api"]').content.trim();
    const localPreview = ["localhost", "127.0.0.1"].includes(location.hostname);
    const apiURL = configuredURL || (localPreview ? "http://localhost:8787/api/chat" : "");
    if (!apiURL) {
        document.getElementById("connectingMessage")?.remove();
        chatInput.disabled = true;
        chatStatus.textContent = "Chat is awaiting server setup.";
        return;
    }

    const id = crypto.randomUUID();
    let pending = false;
    let connected = false;
    let displayedMessages = "";
    const timeFormat = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });

    function element(tag, className, text = "") {
        const node = document.createElement(tag);
        node.className = className;
        node.textContent = text;
        return node;
    }

    function render({ messages, users }) {
        const messageIDs = messages.map(message => message.id).join(",");
        if (messageIDs !== displayedMessages || document.getElementById("connectingMessage")) {
            const nearBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 48;
            chatMessages.replaceChildren(...messages.map(({ username, message, timestamp }) => {
                const row = element("div", "message");
                const header = element("div", "message-header");
                header.append(
                    element("div", "message-name", username),
                    element("div", "message-time", timeFormat.format(timestamp))
                );
                row.append(header, element("div", "message-text", message));
                return row;
            }));
            displayedMessages = messageIDs;
            if (nearBottom) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }
        onlineCount.textContent = users.length;
        onlineUserList.replaceChildren(...users.map(username => {
            const row = element("div", "online-user");
            row.append(element("span", "online-user-dot"), document.createTextNode(username));
            return row;
        }));
    }

    async function sync(message) {
        if (pending) {
            return;
        }
        pending = true;
        sendButton.disabled = true;
        try {
            const response = await fetch(apiURL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    username: (localStorage.getItem("sigmaJelloUsername") || "").trim().slice(0, 60) || "Guest",
                    message
                }),
                signal: AbortSignal.timeout(8000)
            });
            const data = await response.json();
            if (!response.ok) {
                chatStatus.textContent = data.error || "Chat is temporarily unavailable.";
                return;
            }
            connected = true;
            render(data);
            if (message && chatInput.value.trim() === message) {
                chatInput.value = "";
            }
            chatStatus.textContent = "Connected to Jello Chat";
        } catch {
            connected = false;
            document.getElementById("connectingMessage")?.remove();
            chatStatus.textContent = "Chat disconnected. Reconnecting…";
        } finally {
            pending = false;
            sendButton.disabled = !connected;
        }
    }

    function sendMessage() {
        const message = chatInput.value.trim();
        if (connected && message) {
            void sync(message);
        }
    }

    sendButton.addEventListener("click", sendMessage);
    chatInput.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.isComposing) {
            event.preventDefault();
            sendMessage();
        }
    });
    void sync();
    setInterval(() => void sync(), 3000);
})();
