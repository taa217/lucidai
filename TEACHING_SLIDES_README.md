# Teaching Slides System - Lucid Learning Platform

## Overview
The Teaching Slides System is an AI-powered educational content generation platform that creates interactive, visually-rich learning materials with AI voice narration. It uses a multi-agent orchestration system to generate comprehensive slide decks with intelligent positioning, responsive design, and ElevenLabs voice synthesis.

## Code-driven Slides (New)

Slides can now optionally include a `renderCode` field that contains TSX/JSX to render the slide dynamically on the web frontend. This prevents overlapping content by letting the AI precisely control layout via code. Progressive bullet reveals are supported when `isPlaying` is true.

### Contract

- The `Slide` type now has an optional `renderCode?: string`.
- When present, the frontend uses a sandboxed runtime to compile and render the code on web only.
- The code should export a default functional renderer or assign a top-level `Component`/`_default` that returns JSX.
- The runtime provides these symbols in scope:
  - React, View, Text, Image, Animated, StyleSheet, Dimensions, Platform
  - MermaidDiagram (for Mermaid-based diagrams)
  - SVG primitives for code-drawn diagrams: `Svg`, `Path`, `Rect`, `Circle`, `Line`, `Polygon`, `SvgText`
  - utils (e.g., `utils.screen`, `utils.resolveImageUrl(relativePath)`)
  - `props` with `{ slide, showCaptions, isPlaying, timeSeconds, timeline }`

Example `renderCode` body (string):

```
export default function Slide({ slide, showCaptions }) {
  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: '#1a1a1a' }}>
      {slide.title ? (
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 }}>
          {slide.title}
        </Text>
      ) : null}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: '#e5e7eb', fontSize: 16, lineHeight: 24 }}>
            {slide.contents.find(c => c.type === 'text')?.value}
          </Text>
        </View>
        <View style={{ width: '40%', alignItems: 'center', justifyContent: 'center' }}>
          <Image source={{ uri: slide.contents.find(c => c.type === 'image')?.value?.image_url }} style={{ width: '100%', height: '60%' }} resizeMode="contain" />
        </View>
      </View>
      {showCaptions && slide.speaker_notes ? (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', padding: 10 }}>
          <Text style={{ color: '#fff', fontSize: 12 }}>{slide.speaker_notes}</Text>
        </View>
      ) : null}
    </View>
  );
}
```

### Platform support

- Web: Compiled at runtime via `@babel/standalone`.
- Native (iOS/Android): Falls back to the default JSON-driven renderer.

### Dependency

Install on the app package (web):

```bash
cd app && npm i @babel/standalone --save
```

## Recent Updates (Latest)
### ⏱️ Voice-synced dynamic lessons (Teacher Agent) — UPDATED
- TSX renderers now receive `timeSeconds` (current audio playback time) and `timeline` (array of `{ at: number, event: string }`).
- The AI Teacher emits an initial render immediately, then after TTS it emits a refined `timeline` aligned to narration beats, plus a `speak` event with optional `segments` (each has `text`, `start_at`, `duration_seconds`). If Cartesia TTS is enabled, the `speak` event also includes `word_timestamps`—fine-grained word-level timing.
- Guidance for generated code: avoid a single static diagram; use 3–5 beats with multiple elements that enter/exit or change state in sync with narration.

### 🖊️ Code-drawn diagrams (SVG) — NEW
- The runtime exposes lightweight SVG primitives so the AI can draw diagrams directly in TSX without Mermaid.
- Prefer SVG for reliability and fine control; keep shapes simple and readable. Mermaid remains supported as a convenience.

### 🧑‍🏫 New AI Teacher Module (agentic runtime-first) - ADDED
- What: A new backend module `python_services/ai_teacher` that streams a live teaching session as typed events the frontend can render like a YouTube-style lesson.
- Endpoints:
  - `POST /teacher/start` → `{ sessionId }`
  - `POST /teacher/stream` (NDJSON) → events: `start`, then teacher events below, and `done`
- Event model (`TeacherEvent`):
  - `render`: `{ title?, markdown?, code?, language='tsx', runtime_hints? }` — TSX/JSX snippets or markdown the app renders in a safe code runtime
  - `speak`: `{ text, audio_url?, duration_seconds?, voice?, model? }` — narration text and optional OpenAI Voices audio
  - `meta`: `{ data }` — session/lesson metadata updates
  - `final` | `error` | `heartbeat` | `session`
- Implementation:
  - `ai_teacher/agent.py`: Minimal `TeacherAgent` uses GPT‑5 (`gpt-5-2025-08-07`) to produce both narration and TSX code for visuals; TTS via Cartesia (word timestamps) using `python_services/shared/voice_client.py`.
  - `ai_teacher/api.py`: FastAPI router for start/stream with NDJSON output.
  - `ai_teacher/models.py`, `ai_teacher/state.py`: Pydantic models and simple in-memory session store (upgrade to SQLite/Redis later). `SpeakPayload` supports `word_timestamps`.
- Integration: Router is mounted into `slide_orchestrator/api_server.py` at `/teacher/*` for convenience.
- Frontend expectation: An app runtime that can render TSX code blocks similar to `CodeSlideRuntime` and play `speak.audio_url` if present.
- UI behavior update: The audio plays in the background with no visible audio bar. While visuals load and before audio is ready, the UI shows “Starting lesson…”. When playback ends, a “Replay lesson” button appears overlayed. During auto-fixes, audio is paused and an overlay shows “Repairing visuals…”.

#### 🔁 Auto-fix feedback loop for render errors — UPDATED (conversational)
- Problem: Occasionally, code-driven slides throw runtime errors on web (e.g., `TypeError: Animated.useRef is not a function`).
- Solution: The frontend captures runtime errors in `CodeSlideRuntime` and reports them to the backend, which forwards to the AI Teacher service for an automatic quick fix. If a corrected code string is returned, the UI applies it immediately without interrupting the session.
- Flow:
  - App: `CodeSlideRuntime` calls `apiService.reportTeacherRenderError({ sessionId, userId, topic, code, error, timeline, platform })`.
  - Backend: `POST /api/agents/teacher/render-error` proxies to Python `POST /teacher/render-error`.
  - Python: `ai_teacher/api.py` keeps a short `repair_history` per `sessionId` in memory and persists the latest fixed code into `session_state.last_generation.code`. `ai_teacher/fixer.py` first applies safe regex fixes (e.g., `Animated.useRef` → `React.useRef`, `new Animated.Value(...)` → `Animated.Value(...)`). If no change is produced, it escalates to an LLM-based fixer that sends the original error, prior narration/code, and a summary of recent errors (last 5) to produce a repaired TSX string.
  - Frontend enhancement: if the AI returned the minimal placeholder TSX ("Preparing visuals…"), the UI proactively triggers the auto-fix flow with `error: 'placeholder-render'` so the LLM can generate a full renderer even without a thrown exception.
- Files:
  - App: `app/components/slides/CodeSlideRuntime.tsx`, `app/services/api.ts`
  - Backend: `server/src/controllers/ai-agent.controller.ts`, `server/src/services/ai-agent-client.service.ts`
  - Python: `python_services/ai_teacher/api.py`, `python_services/ai_teacher/fixer.py`, `python_services/ai_teacher/models.py`
 - Status: Deterministic fixer + LLM-assisted repair implemented with session-scoped repair history. Frontend now sends structured error payload `{message, stack, filename, stage}` and pauses audio while fixes run.
 - Frontend hardening (New): `CodeSlideRuntime` de-duplicates and throttles error reports per code hash and stage to prevent repeated fix spam and flicker; only one fix attempt runs at a time, identical errors are ignored for 5s, and reports are capped per code version.

### 🧭 Lead Agent Control + GPT‑5 Planning (no Anthropic fallback) - ✅ UPDATED
- **Change**: Lead agent now always plans using **OpenAI GPT‑5 (`gpt-5-2025-08-07`)** with `allow_fallback=false`. Anthropic planner path removed for the Lead.
- **Files Updated**: `python_services/slide_orchestrator/lead_agent.py`, `python_services/slide_orchestrator/graph.py`
- **User Impact**: Consistent planning quality with GPT‑5; deterministic fallback only if OpenAI fails.

### 🧱 Auto‑Layout Engine for Slides (No Overlap) - ✅ ADDED
- **Change**: A final auto‑layout pass in assembly positions text, bullets, and visuals based on layout templates, preventing overlaps and keeping visuals on the right with sensible sizes.
- **Files Updated**: `python_services/slide_orchestrator/graph.py`
- **Details**: Applies per‑layout strategies (`bullet_points`, `full_text`, `diagram`, `text_image`) and reflows stacked items with spacing heuristics.
- **User Impact**: Clean slide composition; no text on top of text; visuals do not obscure content.

### 🎨 Visuals “Zero-Plan” Guard + Minimal Fallback - ✅ ADDED
### 🧠 Lesson Memory + Teaching Persona + Playback Gating - ✅ ADDED
### 🎙️ Teacher‑style Narration (50–90 words) - ✅ UPDATED
- Change: When LLM omits notes, we synthesize natural, teacher‑like `speaker_notes` from slide text/bullets (no generic placeholders).
- Files Updated: `python_services/slide_orchestrator/content_agent.py`
- Impact: Narration sounds like a real teacher guiding the lesson.

### 🧩 Code‑driven Slides + Progressive Reveals - ✅ UPDATED
- Change: Default `renderCode` now reveals text then bullets over time; visuals appear after first bullets.
- Files Updated: `python_services/slide_orchestrator/content_agent.py`, `app/components/slides/CodeSlideRuntime.tsx`
- Impact: Live, classroom‑like pacing when playing slides.

### 🖼️ Relative Image URL Resolution - ✅ ADDED
- Change: `CodeSlideRuntime` provides `utils.resolveImageUrl` so slide code can safely resolve relative paths from the orchestrator (`/storage/generated_images/*`).
- Files Updated: `app/components/slides/CodeSlideRuntime.tsx`
- Impact: AI‑generated images render reliably on web.
- **Lesson Memory**: `lesson_memory` persisted in shared memory stores learning goal, curriculum title, objectives, topics, and slide titles; injected into prompts across phases to keep context coherent.
- **Teaching Persona**: Content prompts now include a classroom persona so `speaker_notes` are written as natural spoken teaching, not meta instructions.
- **Ready for Playback**: Slides get `ready_for_playback` only when they have a real title, positioned contents, and ≥40 chars of notes; streaming endpoint emits only ready slides.
- **Files Updated**: `python_services/slide_orchestrator/content_agent.py`, `python_services/slide_orchestrator/api_server.py`, `python_services/slide_orchestrator/voice_synthesis_agent.py`
- **Impact**: Stronger lesson coherence, no empty placeholders during live playback, narration sounds like a real teacher.
- **Problem**: Visual analysis sometimes returned 0 visuals, leading to poor visual quality.
- **Change**: If the visual plan has 0 actionable items, we generate a fallback visual plan and produce at least a few key diagrams.
- **Files Updated**: `python_services/slide_orchestrator/visual_designer_agent.py`
- **User Impact**: Decks consistently include educational diagrams; visual phase no longer stalls with 0 assets.

### 📚 Sidebar: Library Above Recents - ✅ UPDATED
- **Change**: Moved the Library section above Recents in the sidebar to keep documents immediately accessible even when Recents grows large.
- **Files Updated**: `app/components/navigation/Sidebar.tsx`
- **User Impact**: Library is always visible near the top of the sidebar.

### 📄 Research Export to PDF - ✅ ADDED
- **Change**: Added a download action at the end of each research answer to export the session as a PDF and save it to the user's library.
- **Files Updated**: `app/components/learning/InitialPrompt.tsx`, `app/services/pdfExport.ts`
- **Details**:
  - Generates a simple paper-style PDF with title, author (current user), sections (Abstract, Introduction, Findings), and references.
  - Uploads PDF via `DocumentService.uploadDocument` and opens it in the reader.
  - Button label: "Save as PDF" with a `download-outline` icon.
- **Dependencies**: Requires `pdf-lib` for PDF generation. If missing, the UI alerts with install instruction.
### 🎨 Research UI: Reduced question font and constrained width - ✅ UPDATED
- **Change**: Tuned research turn layout so question text uses a smaller, more compact font and the card width is capped for better readability.
- **Files Updated**: `app/components/learning/InitialPrompt.tsx`
- **Details**:
  - `researchQuestionText.fontSize` reduced and `lineHeight` tightened.
  - `researchResultCard.maxWidth` set to `820` to avoid overly wide lines on large screens.
- **User Impact**: Cleaner, more readable research threads; less visual dominance from the question line.


### 💬 Chat persistence to NeonDB (sessions + messages) - ✅ IMPLEMENTED
- **What**: Reader and general chats are now stored in Neon Postgres using normalized tables `chat_sessions` and `chat_messages` with sensible indexes for performance.
- **Backend**:
  - Entities: `server/src/entities/chat-session.entity.ts`, `server/src/entities/chat-message.entity.ts`
  - Controller: `GET /api/chat/sessions?userId=...`, `GET /api/chat/sessions/:sessionId/messages`, `POST /api/chat/sessions` (for optional upsert)
  - Q&A Stream Persistence: `POST /api/agents/qna/ask/stream` now creates/updates the `chat_sessions` row, stores the user message immediately, and stores the assistant message on the final event.
  - Research Stream Persistence: `POST /api/agents/research/stream` now ensures a session, sets title as `Research: <first question>`, stores the user query and the assistant final answer, with `modelProvider=perplexity` and `metadata.research=true` on messages.
  - Migration: `server/src/migrations/1756000000000-CreateChatTables.ts` (adds tables, FKs, and indexes)
- **Frontend**:
  - `app/services/api.ts`: added `listChatSessions`, `getChatMessages`, `upsertChatSession` DTOs and calls
  - `app/components/navigation/Sidebar.tsx`: loads recent sessions; document chats route to `/read/[docId]` with `{ chatId }`, research sessions route to `/` with `{ chatId }` and open the research thread
  - `app/components/learning/InitialPrompt.tsx`: supports research mode threads; if `chatId` param is present, loads and displays that persisted research session; during live stream captures assigned `sessionId`
  - `app/app/read/[docId].tsx`: passes `sessionId={chatId || 'read_${docId}'}` and document context to `ChatInterface`
  - `app/components/chat/ChatInterface.tsx`: on mount, loads historic messages for the `sessionId`; on send/retry, streams via the backend which persists
- **Performance**:
  - Indexes on `chat_sessions(userId, updatedAt)` and `(userId, docId, updatedAt)` for fast recents; `chat_messages(sessionId, createdAt)` for fast session load
  - Streaming writes to DB are minimal (user message immediately, assistant message once at final)
- **How to migrate**:
  - Ensure `server/.env` has `DATABASE_URL` pointing to Neon (SSL required). Example: `DATABASE_URL=postgresql://user:pass@host/db?sslmode=require`
  - Run migrations from `server/`:
    - PowerShell: `cd server; npm install --silent; npm run migration:run`
    - Bash: `cd server && npm install --silent && npm run migration:run`

### 🌐 Customize Lucid: Preferred Language & Prompt Personalization - ✅ UPDATED
- **Change**: Replaced the "Enable for new chats" switch with a **Preferred language** field in `app/components/navigation/Sidebar.tsx` → Customize Lucid dialog.
- **New Behavior**: Users can set their preferred language (default **English**). Value is persisted to NeonDB via `/auth/customize` and also cached in `AsyncStorage` under `lucid_customize_prefs.preferredLanguage` for offline. During chats, the backend now injects user customization into the Q&A context so the AI adopts the user's preferences.
- **Dev Note**: The previous `enableForNew` preference is removed from the saved payload. If any feature depended on it, update to use `preferredLanguage` or remove the dependency.

### 👤 Customize Lucid: Persist user details to NeonDB + Q&A Prompt Injection - ✅ ADDED
- **Backend**:
  - New endpoints in `server/src/controllers/auth.controller.ts`:
    - `GET /auth/customize` returns `{ displayName?, occupation?, traits?, extraNotes?, preferredLanguage? }`.
    - `PUT /auth/customize` updates any subset of those fields; blanks allowed.
  - Normalized storage: New table `user_customizations` with columns: `userId (unique)`, `displayName`, `occupation`, `traits`, `extraNotes`, `preferredLanguage`, timestamps.
  - Migration `1755000000000-CreateUserCustomization.ts` creates the table and backfills from existing `user_preferences.customPreferences` and `language`.
  - Service: `server/src/services/user.service.ts` now reads/writes `user_customizations` and mirrors `preferredLanguage` to `user_preferences.language` for global language.
  - Q&A Controller Enrichment: `server/src/controllers/ai-agent.controller.ts` now fetches the user's customization via `UserService.getCustomizePreferences(userId)` and merges it into the Q&A `context` as `userPreferences` for both `/api/agents/qna/ask` and `/api/agents/qna/ask/stream`.
  - Python Agent Prompting: `python_services/qna_agent_service/agent.py` appends a "User customization preferences" section to the system prompt (name, occupation, traits, notes, preferred language).
- **Frontend**:
  - `LucidApiService.getCustomizePreferences()` and `.updateCustomizePreferences(...)` added in `app/services/api.ts`.
  - `CustomizeDialog` now loads from backend first, falls back to local cache, and saves to both.
  - `ChatInterface` already forwards `context`; backend enriches it, so no UI change needed.
 - **Ops**:
   - Run migrations on the backend: `npm run typeorm:migration:run` (or your project’s migration command) before deploying.

### 📚 Sidebar Library Empty/Error States - ✅ UPDATED
- **Change**: Removed fallback to mock library items in `app/components/navigation/Sidebar.tsx`.
- **New Behavior**: Shows "Loading…", then either **"No documents"** when none are found or **"Failed to load documents"** on fetch errors.
- **User Impact**: Prevents confusing placeholder items like "Deep Learning" from appearing when data isn't available.

### 📖 Library Screen Mock Removal & Error State - ✅ UPDATED
- **Change**: Removed mock `spaces`, `recents`, and `library` data from `app/components/library/LibraryView.tsx`.
- **New Behavior**: On load failure, shows an inline message "Failed to load your library" instead of mock items; when empty, prompts to upload without placeholders.
- **Sidebar on Library**: The `Sidebar` receives empty arrays and relies on real user documents only; no mock items are passed.

### 🗂️ DocumentService Mock Fallbacks Removed - ✅ UPDATED
- **Change**: `app/services/documentService.ts` no longer returns mock data on errors for: `getUserDocuments`, `getUserCollections`, and `uploadDocument`.
- **New Behavior**: Errors are thrown to the UI so it can show proper empty/error states and retry, preventing mock titles like "Deep Learning" from appearing.

### 📄 Read Screen Sidebar Mocks Removed - ✅ UPDATED
- **Change**: `app/app/read/[docId].tsx` no longer passes `mockSpaces`, `mockRecents`, or `mockLibrary` to `Sidebar`; passes empty arrays instead.

### 👤 Sidebar Profile Menu & Centered Dialogs - ✅ UPDATED
- **Change**: Removed the `Logout` button from `app/components/navigation/Sidebar.tsx` and made the footer user profile clickable.
- **New**: Clicking the profile opens a menu with the user's email and actions: `Customize Lucid`, `Settings`, and `Logout`.
- **Dialogs**: `Settings` and `Customize Lucid` open centered, non-navigating dialogs (no route changes) to keep users in context.
- **User Impact**: Matches modern app patterns (like the screenshot), keeps the sidebar clean, and groups account actions together.

### 💬 Read Mode Chat Welcome Message Removal - ✅ UPDATED
- **Change**: Removed the pre-inserted AI welcome message in `ChatInterface` so the user's first message is the first item in the conversation.
- **Files Updated**: `app/components/chat/ChatInterface.tsx`
- **User Impact**: Cleaner start to chats in reader mode; no AI message appears before the user speaks.

### 🔐 WorkOS AuthKit Integration (Latest) - ✅ WORKING & ENHANCED
- **Problem**: WorkOS authentication was working but users weren't being stored in the database, causing library functionality to fail and sidebar showing "user" instead of real names
- **Solution**: Enhanced WorkOS integration to store users in database and display real user data
- **Issues Fixed**:
  - ✅ **Database Storage**: WorkOS users now stored in Neon/Supabase database
  - ✅ **User Profile Display**: Sidebar now shows real user names from WorkOS
  - ✅ **Library Access**: Users can now access their documents after WorkOS login
  - ✅ **Session Management**: Proper session token handling for API calls
  - ✅ **JWT For APIs**: On callback, backend now issues our API JWT (accessToken) used by guarded endpoints like `/api/documents/*`
- **Current Status**: Complete WorkOS integration with database storage; web now auto-redirects to custom WorkOS login when visiting `/auth` (no button click required); proper logout implemented (redirects to WorkOS logout and returns to `/auth`)
- **Next Steps**: Test the full user flow from login to library access

### 📖 Read Mode Upload Flow (Latest) - ✅ WORKING
- **Problem**: In `InitialPrompt` read mode, opening a locally-picked PDF passed a random `docId` to the reader, causing backend errors like `invalid input syntax for type uuid`.
- **Solution**: Read-mode PDF selection now uploads via the same `DocumentService.uploadDocument` used in the Library. After upload, it navigates to `/read/[docId]` with the real `document.id` (UUID). The document is added to the user's library and opens immediately.
- **Files Updated**: `app/components/learning/InitialPrompt.tsx`
- **User Impact**: Selecting a PDF in read mode adds it to Library automatically and opens reliably.

### 🩹 Read Mode Q&A Reliability Fix (Latest) - ✅ FIXED
### 🤖 GPT‑5 default in Reader Q&A + Auto Ingestion - ✅ UPDATED
- **Change**: Reader chat now defaults to **GPT‑5 (gpt-5-2025-08-07)**. When a document opens, the app auto-uploads chunks to the Q&A vector DB and shows a small status chip.
- **Implementation**:
  - Frontend: `app/app/read/[docId].tsx` triggers `apiService.ingestDocument(...)` after fetching the signed PDF URL and renders an upload status pill above the chat; passes `initialModelKey='gpt-5-2025-08-07'` to `ChatInterface`.
  - Chat UI: `app/components/chat/ChatInterface.tsx` sets GPT‑5 as the first/default model and includes `{ model: { key, label, provider } }` in `context`.
  - Backend: Added `POST /api/agents/qna/ingest` proxy in NestJS → FastAPI `POST /ingest` in Q&A service to chunk and store doc text in `{userId}_doc_{docId}` and fallback to direct URL extraction when needed.

#### 🧵 Q&A Streaming - ✅ ADDED (OpenAI true streaming in reader chat)
- **What changed**: Read-mode chat now streams responses progressively with real OpenAI token streaming when OpenAI is selected; otherwise falls back to chunked streaming after completion.
- **Wire format**: NDJSON lines `{type: 'status'|'keepalive'|'provider'|'content'|'final'|'error'|'done', ...}`
- **Endpoints**:
  - App → Backend: `POST /api/agents/qna/ask/stream`
  - Backend → QnA Service: `POST /ask/stream`
- **Implementation details**:
  - QnA Python streams directly from OpenAI Chat Completions API with `stream=True` and emits `{type:'content', delta}` for each token chunk, then `{type:'final'}`.
  - If streaming cannot be used, it computes the full answer and slices it into deltas as a fallback.
  - Memory write happens after the final chunk (best-effort, non-blocking).
- **Files Updated**:
  - App API: `app/services/api.ts` (existing `streamQuestion(...)`)
  - Chat UI: `app/components/chat/ChatInterface.tsx` already consumes deltas and updates the last message
  - QnA Python: `python_services/qna_agent_service/main.py` improved `/ask/stream` for true streaming; `python_services/qna_agent_service/agent.py` added `prepare_for_stream`
  - Shared LLM: `python_services/shared/llm_client.py` supports model routing and OpenAI Responses/Chat APIs
- **User Impact**: Fast, progressive responses in reader chat; minimal latency to first token.
- **Problem**: In reader chat, the frontend showed no answer because the Nest server timed out after 60s while the Python Q&A finished slightly later. Backend logged: "Request timeout after 60000ms" even though the Python service returned an answer.
- **Solution**: Increased the server-to-Python request timeout to 120s. This prevents premature aborts and lets the frontend receive the response in read mode.
- **Ingestion UX**: Frontend now treats ingest request timeouts as background success and shows “Document queued • indexing in background” instead of error. This matches Python service behavior where OpenAI file upload returns quickly and VDB indexing continues in background.
- **Files Updated**: `server/src/services/ai-agent-client.service.ts` (default `REQUEST_TIMEOUT` → 120000ms)
- **Files Updated** (UX): `app/services/api.ts` (timeout → background success for ingest), `app/app/read/[docId].tsx` (status chip messaging)
- **Config**: You can override with env `REQUEST_TIMEOUT`.
- **User Impact**: Reader chat reliably displays answers even when the first provider takes longer.

### 🔧 Technical Enhancements Applied
- **Database Integration**: Added `workosId` field to `user_auth` table
- **User Service**: Created `createWorkOSUser` method; hardened `updateUser` to whitelist fields (prevents accidental primary key writes causing `null id` errors)
- **WorkOS Callback**: Backend now returns `{ sessionToken, accessToken, refreshToken, user }`
- **Frontend Updates**: `workosAuthService` stores both WorkOS `sessionToken` and API `accessToken`; state includes tokens
- **Document Service**: Uses API JWT for `/api/documents` calls automatically

### 🧠 Agentic Slide-by-Slide Streaming (Anthropic-first, simplified mode) - ✅ IMPLEMENTED
- **Goal**: While the AI is still creating the deck, start teaching immediately. Generate slide 1, stream it to the player, begin narration, then continue generating slide 2, visuals, and voice.
- **How it works**:
  - Python orchestrator (`python_services/slide_orchestrator`) now exposes two streaming modes:
    - `POST /slides/stream-simple` — simplified orchestrator-worker mode that plans, then generates exactly 2 slides (text + voice) and streams them. No research/images.
    - `POST /slides/stream` — full cyclical graph with planner and workers (research/content/visual/voice/assembly).
  - Events for both endpoints:
    - `{type: "slide", slide}` when a new slide is created by the Content agent
    - `{type: "slide_update", slide_number, slide}` when Visual/Voice phases add assets
    - `{type: "final", slides}` when the graph finishes and the full deck is ready
    - `{type: "plan", plan}` when the simplified planner saves its plan to external memory
  - NestJS proxy: `POST /api/agents/teaching/slides/stream` forwards the stream to the app
  - Frontend:
    - `InitialPrompt` (interactive mode) navigates immediately to `/learning/slides` with `{sessionId, userId, learningGoal}`
    - `SlidesScreen` starts `apiService.streamSlides(...)` (full) or a new call for `streamSlidesSimple` (pending hook) and builds the `deck.slides` incrementally
    - `SlidePlayer` plays each slide; voice is requested per slide and cached; as updates arrive (e.g., images), the slide re-renders
- **Files Updated**:
  - Python: `python_services/slide_orchestrator/api_server.py` (added `/slides/stream-simple` and immediate start/heartbeats)
  - Python: `python_services/slide_orchestrator/simple_flow.py` (new minimal flow)
  - Python: external plan persistence in `memory_table('plans')`
  - Backend: `server/src/controllers/ai-agent.controller.ts`, `server/src/services/ai-agent-client.service.ts` (use direct fetch for streaming; Accept text/plain)
  - Frontend: `app/components/learning/InitialPrompt.tsx`, `app/app/learning/slides.tsx`, `app/services/api.ts`
- **User Impact**: Teaching begins faster; deck builds live. Lead agent remains in control of phase routing and task creation. Mem0-backed memory is available via `python_services/shared/memory.py` for agents to store and recall session context when integrated.

### 🔧 OpenAI 400 Error Fix (Latest) - ✅ FIXED
- **Problem**: OpenAI calls returned `400 Bad Request` when using an incompatible default model with the Chat Completions API.
- **Solution**: Set the default OpenAI model in `python_services/shared/config.py` to `gpt-4o`, which is compatible with the Chat Completions endpoint used in `shared/llm_client.py`. The client already falls back to the Responses API when needed.
- **Files Updated**: `python_services/shared/config.py` (default `OPENAI_MODEL` → `gpt-4o`)
- **Notes**: You can still override with env `OPENAI_MODEL`.

### 🔁 QnA Provider Fallback Disabled for ChatInterface (Latest) - ✅ UPDATED
- **Change**: Removed cross-provider fallback in QnA for reader chat requests. The service now uses a single provider (defaults to OpenAI) and surfaces errors immediately.
- **Backend**:
  - `python_services/shared/llm_client.py`: `UnifiedLLMClient.generate_response(...)` now accepts `allow_fallback` (default `True`). When `False`, it routes to one provider and does not try others on failure.
  - `python_services/qna_agent_service/agent.py`: QnA agent calls the LLM client with `allow_fallback=False` so the UI can show a retry when OpenAI fails.
- **User Impact**: Matches UI expectation—if the chosen model fails, users see a clear retry state instead of silent fallback to other providers.

### 💬 Document Reading Chat Sidebar (New) - ✅ WORKING
- **Feature**: While reading a document in `read/[docId]`, learners can now chat with an AI about the current document.
- **Implementation**:
  - Replaced mock chat UI with reusable `ChatInterface` wired to QnA agent.
  - Passes rich context: `{ docId, documentTitle, documentUrl, source: 'read_document' }` so answers can be grounded in the opened doc.
  - Session is namespaced per document via `sessionId="read_${docId}"`.
  - Added a polished model selector dropdown in the chat input with models: `Claude 4 Opus`, `GPT‑5`, `Gemini 2.5 Pro`. Selection sets `preferredProvider` and is included in `context.model`.
  - New Python-side retrieval: the QnA agent fetches relevant document chunks from the user‑scoped vector DB and (optionally) recalls user memories via Mem0 when configured.
- **Files Updated**: `app/app/read/[docId].tsx`, `python_services/qna_agent_service/agent.py`
- **New Files**: `python_services/qna_agent_service/document_context.py`, `python_services/shared/memory.py`
- **Backend**: Continues to use `/api/agents/qna/ask` through `apiService.askQuestion` with enriched context.
- **User Impact**: Answers are better grounded in the current document and can adapt based on prior interactions when memory is enabled.

### 📎 Document-aware Q&A Grounding (Latest) - ✅ ENABLED
- **What changed**: The Q&A agent now ingests and searches the focused document (by `docId`) on-demand.
- **How it works**:
  - Uses `docId` from chat context to fetch processed text via Document Processor.
  - Sentence-based chunking (~800 chars) with metadata, stored in a per-user, per-doc collection: `{userId}_doc_{docId}`.
  - Similarity search runs against the doc-scoped collection with fallback to `{userId}_default`.
  - Retrieved chunks are injected into system context for grounding.
- **Files Updated**: `python_services/qna_agent_service/document_context.py`
- **Notes**: If the document processor is unavailable, the agent fails soft and still answers without grounding.

### 🧹 Chat UI Overflow Fix in Reader (Latest) - ✅ WORKING
- **Problem**: In `read/[docId]`, long AI messages overflowed the chat panel and were partially hidden.
- **Solution**: Refactored `ChatInterface` layout to be container-relative and wrap text safely.
  - Replaced window-based widths with percentage-based `maxWidth` and enabled `flexShrink`.
  - Added web-safe wrapping (`wordBreak: break-word`, `whiteSpace: pre-wrap`).
  - Render AI responses as a flat message (no bubble) to maximize readable width in the narrow sidebar.
- **Files Updated**: `app/components/chat/ChatInterface.tsx`
- **User Impact**: Chat text never overflows; AI responses are easier to read in the side panel while reading documents.

### 🎯 Branded Empty State for Chat (Latest) - ✅ UPDATED
- **Change**: Introduced a centered, branded hero empty state with the Lucid logo, clear title, and concise subtitle.
- **New Behavior**: Before the first message, users see a polished prompt: "Start a Conversation" and "Ask a question about your document or any topic.".
- **Files Updated**: `app/components/chat/ChatInterface.tsx`

### ✍️ Markdown Rendering for AI Responses (Latest) - ✅ WORKING
- **Problem**: AI replies often contained raw markdown markers like `**bold**`, `*italic*`, and `## headings` which displayed literally.
- **Solution**: Added a lightweight inline Markdown renderer in `ChatInterface` for headings, bold, italics, inline code, lists, and links without extra dependencies.
- **Files Updated**: `app/components/chat/ChatInterface.tsx`
- **User Impact**: AI messages render cleanly and are easier to read, matching the intended formatting.

### 🎨 UI/UX Improvements (Latest)
- **Custom WorkOS UI**: Beautiful authentication screen with brand colors (`#2196F3`)
- **Responsive Design**: Works on web, iOS, and Android
- **Loading States**: Proper loading indicators during authentication
  - New: Branded Lucid splash screen with logo appears during startup and authentication checks.
- **Library Loading Skeleton**: Library now shows an animated skeleton for header, search, collections, and document grid while data loads (replaces plain "Loading your library…").
- **Error Handling**: User-friendly error messages and retry options
- **Sidebar Branding**: Replaced top user profile header with Lucid brand header (logo + "Lucid"); removed "Spaces" section; moved collapse toggle next to brand and tightened top spacing
- **Real User Data**: Footer still shows current user (name/avatar); library and recents unchanged

## Current Project Status

Last reviewed: 2025-08-27

### ✅ **Completed Features**
- **WorkOS AuthKit Integration**: Complete authentication system with database storage
- **User Database Storage**: WorkOS users stored in Neon/Supabase with proper relationships
- **Real User Display**: Sidebar shows actual user names and profile pictures
- **Library Integration**: Users can access their documents after WorkOS authentication
- **Multi-Agent AI System**: Python services for content generation
- **Voice Synthesis**: ElevenLabs integration for AI voice narration
- **Beautiful Frontend**: Professional React Native app with tabs
- **Backend API**: NestJS backend with proper CORS and Swagger docs
- **Health Monitoring**: Service status monitoring and health checks
- **Document Chat**: Contextual chat sidebar in reader using QnA agent

### 🔄 **In Progress**
- **End-to-End Testing**: Verifying complete user flow from login to library access
- **Document Upload**: Validated with API JWT; monitoring edge cases
- **Document-grounded QA**: Enabled with doc-scoped ingestion; tune chunking/ranking and caching
- **Memory**: Optional Mem0.ai memory enabled; ensure `MEM0_API_KEY` is set to activate
- **Performance Optimization**: Ensuring smooth user experience
- **Streaming Deck UX**: Add UI affordances for "Generating…" banners and progress in `SlidePlayer`; prefetch voice for next slide while current is playing

### 📋 **Next Steps**
1. **Test Complete Flow**: Login → Interactive mode → Streamed slides playback with voice
2. **Verify Document Access**: Ensure users can see their uploaded documents
3. **Grounding Quality**: Validate that QnA answers leverage `documentUrl`/`docId` context
4. **Production Setup**: Prepare for deployment with production credentials

### Environment Notes
- Ensure Python virtual environment is activated before running services (Windows: `venv\Scripts\activate`).
- Local ports alignment: Backend `3001`, Q&A service `8001`, Frontend (Expo web) `8081`.

### Deployment (Vercel + Render)

- Web (Vercel):
  - App root: `app/`
  - Build Command: `npm ci && npm run build`
  - Output: `dist/`
  - Env on Vercel: set `EXPO_PUBLIC_API_HOST=<your-backend-domain>` and WorkOS `EXPO_PUBLIC_*`
  - `app/vercel.json` includes a rewrite to proxy `/api/*` to your backend; replace `YOUR_BACKEND_DOMAIN`.

- Backend (Render):
  - Root: `server/`
  - Build: `npm ci && npm run build`
  - Start: `npm run start:prod`
  - Env: `DATABASE_URL`, `REQUEST_TIMEOUT=120000`, `QNA_SERVICE_URL`, `SLIDE_ORCHESTRATOR_URL`, `AI_TEACHER_URL`, `CORS_ORIGIN=<your web origin>`

- Python services (Render):
  - QnA: root `python_services/qna_agent_service` start `uvicorn main:app`
  - Orchestrator: root `python_services` start `uvicorn slide_orchestrator.api_server:app`
  - Env: provider keys (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, etc.)

See `render.yaml` for a working blueprint.

## System Architecture

### Backend Services
- **NestJS API** (Port 3001): Main backend with WorkOS integration and database storage
- **Python AI Services** (Ports 8001-8005): Content generation and voice synthesis
- **WorkOS AuthKit**: Enterprise authentication with database integration
- **Database**: Neon/Supabase with normalized user schema

### Frontend
- **React Native + Expo**: Cross-platform mobile and web app
- **WorkOS Authentication**: Secure login with database storage
- **Real User Data**: Sidebar displays actual user information
- **Responsive Design**: Works on all devices and screen sizes

### AI Services
- **Content Generation**: Multi-agent system for educational content (Lead → Research → Content → Visual → Voice → Assembly)
- **Voice Synthesis**: ElevenLabs integration for AI narration
- **Document Processing**: Smart file handling and analysis

### Interactive mode end‑to‑end flow (agentic streaming)
- **1. User action (app)**: In `app/components/learning/InitialPrompt.tsx`, interactive mode calls `router.push('/learning/slides', { sessionId, userId, learningGoal })` immediately.
- **2. Slides screen (app)**: `app/app/learning/slides.tsx` starts `apiService.streamSlides(...)` to receive NDJSON events and build the deck incrementally.
- **3. Backend proxy (NestJS)**: `POST /api/agents/teaching/slides/stream` in `server/src/controllers/ai-agent.controller.ts` forwards chunks to the client.
- **4. Backend → Python orchestrator**: `AIAgentClientService.streamSlides` calls `POST {SLIDE_ORCHESTRATOR_URL}/slides/stream` with `{ user_query, learning_goal, user_id, session_id }`.
- **5. Orchestrator (FastAPI)**: `python_services/slide_orchestrator/api_server.py` launches the agent graph (`run_demo`) and streams events while monitoring shared memory:
  - `{type: "slide", slide}` when content agent adds a new slide
  - `{type: "slide_update", slide_number, slide}` when visuals/voice enrich a slide
  - `{type: "final", slides}` when assembly completes
- **6. Agent graph (Python)**: `python_services/slide_orchestrator/graph.py` wires agents:
  - Lead agent (`lead_agent.py`) plans phases and creates tasks
  - Research (`research_agent.py`) gathers sources
  - Content (`content_agent.py`) drafts slides and appends to `content_tasks` via `_append_slide_to_task`
  - Visuals (`visual_designer_agent.py`) generates images and updates slides
  - Voice (`voice_synthesis_agent.py`) synthesizes narration and updates slides
  - Assembly collates into a final deck
- **7. UI updates (app)**: Each event updates `deck.slides` and `SlidePlayer` re-renders; voice can play per slide as soon as available.

Sequence (simplified):

```mermaid
sequenceDiagram
  participant User
  participant App as App (InitialPrompt/SlidesScreen)
  participant Nest as NestJS API (/api/agents)
  participant Py as Slide Orchestrator (FastAPI)
  participant Agents as Lead/Research/Content/Visual/Voice

  User->>App: Start (interactive) with learningGoal
  App->>App: Navigate to /learning/slides
  App->>Nest: POST /api/agents/teaching/slides/stream
  Nest->>Py: POST /slides/stream {user_query, learning_goal, session_id}
  Py->>Agents: run_demo (build graph)
  Agents-->>Py: write slides/updates to shared memory
  Py-->>Nest: NDJSON {type: slide|slide_update|final}
  Nest-->>App: proxy stream
  App->>App: Render slides incrementally; play voice when ready
```

### Visual assets: generation, storage, and rendering

- **Mermaid diagrams (AI‑generated code, not files)**
  - Generated by the Visual Designer agent as Mermaid text and attached to slide content with `asset_type: "mermaid_diagram"` and `mermaid_code`.
  - Rendered on the frontend by `app/components/slides/MermaidDiagram.tsx` directly from the code. No disk storage.

- **Image diagrams (AI‑generated images, saved as files)**
  - Saved under `storage/generated_images/` at the project root by the Python slide orchestrator.
  - Served by FastAPI at `/storage/generated_images/*` via a static mount in `python_services/slide_orchestrator/api_server.py`.
  - The slide JSON includes `image_url` (e.g., `/storage/generated_images/<filename>.png`), which the app uses to render the image.

- **Heads‑up for local dev**
  - Ensure the Slide Orchestrator service is running so the static mounts are available.
  - The app must fetch images from the orchestrator base URL. If your `image_url` is a relative path, route or proxy it through your API/backend domain or prefix it with the orchestrator base URL.

### Planned: Agentic Planner and Tool Calling (refactor)

- **Goal**: Remove implicit, flag-driven sequencing (e.g., `{needs_visual: true}`) and replace with a Supervisor that uses LLM function/tool-calling to decide—per slide—what tools to invoke (research, content, diagrams, images, voice) to maximize learning quality.

- **Core pieces**:
  - **Tool Registry**: `python_services/slide_orchestrator/tools.py` defines strongly-typed tools (Pydantic schemas) and adapters to existing agents:
    - `research.search_web(args)` → wraps `ResearchAgent`
    - `content.write_slide(args)` → wraps `ContentDraftingAgent`
    - `visuals.generate_diagram(args)` and `visuals.generate_image(args)` → wraps `VisualDesignerAgent`
    - `voice.synthesize(args)` → wraps `VoiceSynthesisAgent`
    - `slides.update(args)` → helper to patch slide fields
  - **Supervisor/Planner**: `PlannerSupervisor` in `lead_agent.py` uses our `UnifiedLLMClient` function-calling to emit one next action at a time: `{ action: 'call_tool' | 'approve_slide' | 'finish_deck', tool?, args? }` based on the current `TeachingAgentState` and a quality rubric.
  - **Quality rubric (no hardcoded flags)**: Prompt includes criteria for when visuals add value (spatial/quantitative relationships, multi-step processes, unfamiliar structures) and when narration improves comprehension (dense/explanatory text, step-by-step). The model reasons and chooses tools—no boolean switches passed through state.
  - **Streaming protocol additions (backward compatible)**: New NDJSON events (optional for UI): `decision`, `tool_start`, `tool_end`, `phase`, `quality_note`. Existing `slide`, `slide_update`, `final` remain unchanged.
  - **Safety & retries**: Each tool returns `{ result, cost, durationMs, confidence }`. The supervisor retries with exponential backoff on transient failures; escalates to alternatives (e.g., diagram → image) when confidence < threshold.

- **Implementation steps**:
  1. Create `tools.py` with `Tool`, `ToolCall`, and `ToolRegistry` (register wrappers around existing agents).
  2. Add `PlannerSupervisor` to `lead_agent.py` with a `decide_next_action(state)` function-call schema and integrate into the graph loop.
  3. Wrap agents so they can be invoked both by the legacy pipeline and via tools; keep `SLIDES_PLANNER=legacy|supervisor` env to toggle.
  4. Emit new NDJSON events from `api_server.py` while preserving current events for the app.
  5. Add tests covering branching decisions (diagram vs. text-only, voice vs. no-voice) under `python_services/slide_orchestrator/tests/`.

- **Why this helps**:
  - Decisions are learned and contextual, not hardcoded.
  - Easy to add new capabilities (e.g., `simulate`, `quiz.generate`) by registering new tools.
  - Better UX: slides feel tailored; visuals/voice appear only when they add value.

## Notes on modes

Interactive (agentic slides) uses the Slide Orchestrator service described above.

Research mode (Perplexity Sonar Deep Research)
- Frontend: `app/components/learning/InitialPrompt.tsx` routes to `app/app/learning/research.tsx` when `mode === 'research'`.
- UI: Research uses `app/components/chat/ChatInterface.tsx` with a Research toggle. Streaming shows a "thinking" trace.
- Server (NestJS): `POST /api/agents/research/stream` streams newline-delimited JSON chunks from the Python proxy.
- Python proxy: `python_services/qna_agent_service/main.py` exposes `POST /research/stream` which streams from Perplexity using `PERPLEXITY_API_KEY` and `sonar-deep-research` model. Configure env in `python_services/.env`.
- Pricing/Model docs: see Perplexity Sonar Deep Research docs (`https://docs.perplexity.ai/getting-started/models/models/sonar-deep-research`).

Checklist
- [x] Research streaming endpoint in Python qna service
- [x] NestJS proxy endpoint `/api/agents/research/stream`
- [x] Frontend research route and chat integration with streaming
- [ ] Styling for citations rendering (links) in research UI
- [ ] E2E test covering research streaming path
- `python_services/slide_generation_service/main.py` — legacy experimental service; current flow uses `slide_orchestrator` via `api/agents/teaching/slides/stream`.
- `python_services/document_processor/*` — legacy document flow; kept only if needed for future ingestion.

Note: Keep these in a `legacy/` folder if you want to preserve history.

## Database Schema Updates

### Chat Sessions & Messages (New)
- Migration: `1756000000000-CreateChatTables.ts` creates `chat_sessions` and `chat_messages` with FKs to `users` and `user_documents` (for `docId`).
- Indexes:
  - `chat_sessions(userId, updatedAt)` and `(userId, docId, updatedAt)`
  - `chat_messages(sessionId, createdAt)`
- Primary query paths covered: recents list, open session, load messages chronologically.

### New WorkOS Integration
```sql
-- Added workosId field to user_auth table
ALTER TABLE "user_auth" ADD "workosId" character varying(255);
```

### User Storage Flow
1. **WorkOS Authentication**: User authenticates via WorkOS
2. **Database Check**: System checks if user exists in database
3. **User Creation/Update**: Creates new user or updates existing user with WorkOS data
4. **Session Management**: Stores WorkOS session token for API calls
5. **Profile Display**: Sidebar shows real user data from database

## Quick Start Guide

### 1. **Set Up Environment Variables**
```bash
# Backend (server/.env)
WORKOS_API_KEY=sk_test_your_key_here
WORKOS_CLIENT_ID=client_your_id_here
WORKOS_COOKIE_PASSWORD=your_32_char_password

# Frontend (app/.env)
EXPO_PUBLIC_WORKOS_CLIENT_ID=client_your_id_here
EXPO_PUBLIC_WORKOS_BASE_URL=http://localhost:3001
EXPO_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:8081/auth/callback
```

### 2. **Start Services**
```bash
# Backend
cd server && npm run start:dev

# Frontend
cd app && npm start
```

### 3. **Test Complete User Flow**
1. Open app in browser
2. Navigate to `/auth` – it should automatically redirect to the custom WorkOS login
3. Complete authentication
4. Verify sidebar shows real user name
5. Navigate to Library
6. Upload and view documents

## Configuration Files

### WorkOS Setup
- `WORKOS_QUICK_FIX.md`: Complete setup guide for authentication
- `WORKOS_SETUP.md`: Detailed integration documentation
- `WORKOS_ENV_SETUP.md`: Environment variable configuration

### Service Configuration
- `QUICK_START_FIXED.md`: Backend setup and testing
- `QUICK_FIX.md`: Common issues and solutions
- `MATH_TEACHING_README.md`: Math teaching service documentation

## Troubleshooting

### Authentication Issues
1. **Check environment variables** are set correctly
2. **Verify WorkOS dashboard** settings match exactly
3. **Restart services** after configuration changes
4. **Check logs** for detailed error messages

### Database Issues
1. **Migration**: Ensure `workosId` field was added to `user_auth` table
2. **User Storage**: Check if users are being created in database
3. **Session Tokens**: Verify session tokens are being stored properly

### Service Issues
1. **API Keys**: Ensure at least one AI provider key is set
2. **Ports**: Verify services are running on correct ports
3. **CORS**: Backend is configured for frontend communication
4. **Health Checks**: Use status tab to monitor service health

## Development Notes

### Code Organization
- **Modular Structure**: Services separated by functionality
- **Clean Architecture**: Proper separation of concerns
- **Type Safety**: TypeScript throughout the stack
- **Error Handling**: Comprehensive error handling and logging
- **Database Integration**: Proper user storage and retrieval

### Best Practices
- **Environment Variables**: Secure configuration management
- **API Documentation**: Swagger docs for all endpoints
- **Testing**: Health checks and service monitoring
- **Security**: WorkOS enterprise-grade authentication
- **Data Persistence**: Proper user data storage and management

## Production Readiness

### Security
- ✅ **WorkOS Authentication**: Enterprise-grade security
- ✅ **Environment Variables**: Secure configuration
- ✅ **CORS Configuration**: Proper cross-origin handling
- ✅ **API Key Management**: Secure API key storage
- ✅ **Database Security**: Proper user data protection

### Scalability
- ✅ **Microservices**: Modular service architecture
- ✅ **Load Balancing**: Ready for horizontal scaling
- ✅ **Caching**: Voice synthesis caching for performance
- ✅ **Monitoring**: Health checks and service status
- ✅ **Database**: Scalable user storage with proper relationships

### Deployment
- **Environment Setup**: Production environment variables
- **Service Configuration**: Production API keys and endpoints
- **Domain Configuration**: Production URLs and redirects
- **SSL/TLS**: HTTPS configuration for production
- **Database**: Production database with proper backups

The system now has complete WorkOS integration with database storage and real user data display! 🚀 

## Capacity & Deployment (target: ~2,000 DAU)

### Assumptions
- Peak concurrent users (CCU): 1–2% of DAU → ~20–40 CCU.
- Mix: ~70% Reader Q&A, ~25% passive browsing, ~5% run agentic slides.
- Average Q&A token use: 2–3K tokens per answer; slides deck: 6–12 LLM calls + TTS/images.

### Recommended baseline (cost-efficient, scalable)
- Frontend (web): Vercel Hobby/Pro — static + SSE-friendly proxy to backend.
- Backend API (NestJS): 2× small instances (1 vCPU/1–2GB) behind a load balancer; sticky or stateless SSE proxy.
- Python Orchestrator (FastAPI): 2× small instances (2 vCPU/2–4GB) for streaming endpoints.
- Database: Neon Postgres + PgBouncer (20–50 max pooled connections).
- Cache/Queue: Redis (100–250MB) for rate-limits, ephemeral state, and future job queue.
- Assets: Object storage (S3/R2) + CDN for generated images/audio.

Expected capacity with above:
- Reader Q&A: 100–250 concurrent SSE streams (provider limits permitting).
- Slides: 10–30 concurrent active builds; queue beyond that (if/when added).

### Minimal deployment steps
1) Backend API (NestJS)
   - Build: `npm ci && npm run build`
   - Start: `npm run start:prod`
   - Env: `PORT=3001`, `DATABASE_URL`, `REQUEST_TIMEOUT=120000`, all provider keys.
   - Health: `/health` and increase upstream timeouts for SSE routes.
   - Run migrations on deploy: `npm run migration:run`.

2) Python Orchestrator (FastAPI)
   - Start: `uvicorn python_services.slide_orchestrator.api_server:app --host 0.0.0.0 --port 8003 --workers 2`
   - Env: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, any image/diagram providers.
   - Static: mount `/storage/generated_images/*` and point CDN to it or rewrite paths via API domain.

3) Postgres + PgBouncer
   - Neon connection string with `sslmode=require`.
   - PgBouncer pool size ≈ total app instances × 5–10.

4) Redis (optional now, required for queue later)
   - Use for rate limiting and ephemeral state; later, add Celery/RQ/BullMQ workers for slides queue.

5) Vercel
   - `EXPO_PUBLIC_*` envs pointing to backend base URL.
   - Configure rewrites/proxy for `/api/agents/*` to NestJS with long timeouts for SSE.

### Cost-aware scaling knobs
- Horizontal scale NestJS first (cheap CPU, handles SSE proxying).
- Keep Python workers smaller count but higher CPU; cap concurrent slide builds per instance.
- Add a queue for slides before increasing worker count; improves UX and protects provider quotas.

### Hardening checklist (pre-GA)
- Rate limits and quotas per user/org; friendly queued states in UI.
- Observability: Sentry, structured logs, latency/error metrics; alerts on provider 429/5xx.
- Security: secrets manager, JWT scoping, audit logs; WorkOS prod domains.
- Cost controls: budgets/alerts on OpenAI/Perplexity/ElevenLabs; cache voice/image artifacts.
