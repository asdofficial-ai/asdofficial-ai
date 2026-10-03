# Kane local interface contract

Base URL: `http://127.0.0.1:3001`. JSON requests require `Content-Type: application/json`. The cockpit is at `/`. Default hosting binds to loopback. Public hosting requires an HTTPS PUBLIC_ORIGIN, APP_PASSWORD and persistent DATABASE_PATH; all API routes except health/login require authentication when configured.

| Method | Endpoint | Input / result |
| --- | --- | --- |
| GET | `/api/health` | `{status:"ok"}` |
| GET | `/api/capabilities` | Configuration status and implementation flags, never credentials |
| POST | `/api/sessions` | Creates `{type:"session.created",session:{id,created_at}}` |
| GET | `/api/sessions/:id` | `{messages:[{id,session_id,role,content,created_at}]}` |
| POST | `/api/sessions/:id/messages` | `{text,requestId}` → SSE response |
| POST | `/api/sessions/:id/cancel` | Requests cancellation of the active turn |
| DELETE | `/api/sessions/:id` | Deletes history; cancel active turn first |
| GET | `/api/memories`, `/api/notes`, `/api/tasks` | `{items:[...]}`, newest 200 |
| POST | Same item endpoints | `{content,source?,completed?,confirmed?}` |
| PATCH | Item endpoint plus `/:id` | Updates content and fields; complete tasks with `completed:true` |
| DELETE | Item endpoint plus `/:id` | Deletes the item |
| DELETE | `/api/memories` | Deletes all durable memories |
| PATCH | `/api/memory/settings` | `{enabled:boolean}`; disabling excludes memories from model context |
| GET | `/api/tools` | Read-only calculator/time tool schemas |
| POST | `/api/tools/execute` | `{name:"calculator",arguments:{expression:"2+3"}}` or `{name:"time",arguments:{timezone:"America/Los_Angeles"}}` |
| POST | `/api/chat` | `{text}` → standalone `{text}`; no session history |
| POST | `/api/voice` | `{text}` → MP3 audio from Fish |

Memory creation and updates require `confirmed:true`. This is explicit confirmation by the interface's user; do not automatically set it for model-generated requests. Sensitive-content checks reject obvious password/key/payment patterns; they are not a comprehensive personal-data classifier. Memory is local plaintext SQLite data. Do not save secrets or sensitive personal data.

SSE messages have `event: <type>` and a JSON `data` object containing `type`, `sessionId`, `turnId`, and a monotonically increasing per-turn `sequence`. Types:

- `assistant.state`: `state` is `thinking`, `error`, or `idle`.
- `response.delta`: incremental `text`.
- `response.completed`: stored assistant `messageId`.
- `turn.cancelled`: cancellation; partial output is not stored as a completed answer.
- `error`: safe fixed `code`; no provider body is forwarded.

The cockpit records microphone audio only after a user click, with silence detection. POST /api/transcribe accepts raw supported audio up to 8 MiB and uses the configured Groq speech key. Fish playback uses /api/voice. Opt-in browser wake recognition is available where supported; it listens while the cockpit is open and visible and pauses during voice turns. Stop disables it.

Clients must reuse a `requestId` for retries. A duplicate request returns HTTP 409 without another provider call; read history to recover completed output. Changed input with the same identifier is rejected. Concurrent turns in one session return 409. Disconnects cancel active work. Provider operations time out after 30 seconds. No automatic external-action retries are performed.

Context uses at most 16,000 characters of recent history and up to five relevant explicit memories (400 characters each). Older messages remain in SQLite but are not summarized yet. Output is bounded to 1,024 model tokens / 32,000 characters. Models do not call tools autonomously in this version; calculator, notes, tasks and memory are explicit API operations. POST /api/search accepts {query} and uses configured Groq browser search. GET /api/markets/forex?pair=EURUSD returns daily reference rates and experimental baseline intervals. Android companion APIs support pairing, approval, polling and acknowledgement of open_url, dial_number and draft_sms actions; each requires explicit cockpit approval and a phone tap. Calls/SMS are completed by the user. Selected-file access and autonomous scheduling are disabled. Persistent reminders are available through the explicit reminder APIs.

HTTP limits: 16 KiB JSON request bodies, 4,000-character user text, 120 requests/minute for the local service, 10-second request/header reception timeout. Voice output is bounded to 10 MiB. Startup logs only configuration statuses. The server never logs message bodies or upstream errors. Shut down gracefully with Ctrl+C.

GET /api/reminders returns pending reminders and serverTime. POST /api/reminders accepts title (1-500 characters), dueAt (future ISO UTC timestamp), repeatHours (0, 24 or 168). PATCH /api/reminders/:id accepts action snooze (10 minutes) or dismiss (advance repeating reminder or finish one-time reminder). DELETE /api/reminders/:id removes a reminder. Reminder records persist in SQLite; UI notifications are delivered by open browser tabs, not a closed-browser push service.
