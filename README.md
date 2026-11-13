# Sigma
random site I made based off sigma client
t

## Jello Portal chat

The Portal uses a separate Node.js 24+ chat service with SQLite. Locally, serve
this repository at `http://localhost:8000` and run `node chat-server.mjs` in a
second terminal. The Portal uses `http://localhost:8787/api/chat` for local
previews. Enable Beta Mode on the home page to open the Portal.

For GitHub Pages, deploy one instance of `chat-server.mjs` to a Node host
with HTTPS and persistent storage. Set these environment variables there:

- `JELLO_CHAT_ORIGINS` to the site origin, such as `https://j3lf.github.io`, without a path.
- `JELLO_CHAT_DB` to a SQLite file on a persistent disk outside the public site directory.
- `PORT` to the host's HTTP port if the host does not set it. The default is 8787.

Set the `jello-chat-api` meta tag in `jelloportal.html` to the public HTTPS
endpoint ending in `/api/chat`. Visitors share one room using their Jello
display names. The service displays the latest 100 messages, expires history
after 12 hours, and removes inactive tabs from presence after about 45 seconds.
