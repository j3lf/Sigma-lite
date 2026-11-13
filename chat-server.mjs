import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const database = new DatabaseSync(process.env.JELLO_CHAT_DB || join(tmpdir(), "sigma-jello-chat.sqlite"));
const allowedOrigins = new Set((process.env.JELLO_CHAT_ORIGINS || "http://localhost:8000,http://127.0.0.1:8000")
    .split(",").map(origin => origin.trim()));
const messageLifetime = 12 * 60 * 60 * 1000;
const presenceLifetime = 45 * 1000;
const presence = new Map();

database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_timestamp ON messages(timestamp);
`);
const insertMessage = database.prepare("INSERT INTO messages (username, message, timestamp) VALUES (?, ?, ?)");
const deleteOldMessages = database.prepare("DELETE FROM messages WHERE timestamp < ?");
const recentMessages = database.prepare("SELECT id, username, message, timestamp FROM messages WHERE timestamp >= ? ORDER BY id DESC LIMIT 100");

function prune(now) {
    deleteOldMessages.run(now - messageLifetime);
    for (const [id, user] of presence) {
        if (user.seen < now - presenceLifetime) {
            presence.delete(id);
        }
    }
}

function sendJson(response, status, data) {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
        return sendJson(response, 403, { error: "Chat is unavailable for this site." });
    }
    if (origin) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
    }
    if (request.url !== "/api/chat") {
        return sendJson(response, 404, { error: "Not found." });
    }
    if (request.method === "OPTIONS") {
        response.writeHead(204, {
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "Content-Type"
        }).end();
        return;
    }
    if (request.method !== "POST" || request.headers["content-type"] !== "application/json") {
        return sendJson(response, 400, { error: "Expected a JSON chat request." });
    }

    let data;
    try {
        const chunks = [];
        let size = 0;
        for await (const chunk of request.iterator({ destroyOnReturn: false })) {
            size += chunk.length;
            if (size > 2048) {
                request.resume();
                return sendJson(response, 413, { error: "Chat request is too large." });
            }
            chunks.push(chunk);
        }
        data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        return sendJson(response, 400, { error: "Invalid chat request." });
    }

    const id = data?.id;
    const username = typeof data?.username === "string" ? data.username.trim() : "";
    const message = typeof data?.message === "string" ? data.message.trim() : "";
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id) ||
        !username || username.length > 60 ||
        (data.message !== undefined && (!message || message.length > 200))) {
        return sendJson(response, 400, { error: "Invalid chat username or message." });
    }

    const now = Date.now();
    try {
        prune(now);
        const user = presence.get(id) || { lastMessage: 0 };
        if (!presence.has(id) && presence.size >= 500) {
            return sendJson(response, 503, { error: "The chatroom is full." });
        }
        if (message) {
            if (now - user.lastMessage < 1000) {
                return sendJson(response, 429, { error: "Wait a moment before sending another message." });
            }
            insertMessage.run(username, message, now);
            user.lastMessage = now;
        }
        presence.set(id, { ...user, username, seen: now });
        sendJson(response, 200, {
            messages: recentMessages.all(now - messageLifetime).reverse(),
            users: [...presence.values()].map(user => user.username)
        });
    } catch (error) {
        console.error("Jello Chat request failed", error);
        sendJson(response, 500, { error: "Chat is temporarily unavailable." });
    }
});

server.listen(Number(process.env.PORT || 8787), () => {
    console.log("Jello Chat listening on port", server.address().port);
});
setInterval(() => prune(Date.now()), 60_000).unref();
