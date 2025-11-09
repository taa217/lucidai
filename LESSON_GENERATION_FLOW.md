# Lesson Generation Flow: Technical Deep Dive

This document explains in detail how a lesson gets generated from when a user submits what they want to learn in `LearningInterface.tsx` through the entire system architecture.

## Overview: The Complete Journey

```
User Input → Frontend → API Service → Python Backend → LLM → TTS → Frontend Runtime → Visual Rendering
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React/TypeScript)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  LearningInterface.tsx                                                        │
│  ├─ User submits topic: "What is React?"                                     │
│  └─ Sets isTeaching=true, renders AITeacherSession                           │
│                                                                               │
│  AITeacherSession.tsx                                                         │
│  ├─ useTeacherStream hook                                                    │
│  │  └─ Creates StreamLessonRequest                                           │
│  ├─ apiService.streamTeacherLesson()                                         │
│  │  └─ POST /teacher/stream (NDJSON streaming)                               │
│  ├─ Receives events: render, speak, final                                    │
│  └─ Updates session state                                                    │
│                                                                               │
│  CodeSlideRuntime.tsx                                                         │
│  ├─ Receives TSX code from render event                                      │
│  ├─ Compiles TSX → JS (Babel standalone)                                     │
│  ├─ Executes code in sandbox                                                 │
│  ├─ Renders Lesson component with props:                                     │
│  │  • slide: { title }                                                       │
│  │  • timeSeconds: current audio time                                        │
│  │  • timeline: animation events                                             │
│  └─ Updates visuals as timeSeconds changes                                   │
│                                                                               │
│  useAudioPlayer.ts                                                            │
│  ├─ Receives audio_url from speak event                                      │
│  ├─ Creates HTML5 Audio element                                              │
│  ├─ Tracks playback time (timeSeconds)                                       │
│  └─ Synchronizes with visual animations                                      │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP POST /teacher/stream
                                      │ (NDJSON streaming response)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Python/FastAPI)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  api_server.py                                                                │
│  ├─ FastAPI app                                                               │
│  └─ Mounts ai_teacher router                                                 │
│                                                                               │
│  ai_teacher/api.py                                                            │
│  ├─ POST /teacher/stream endpoint                                            │
│  ├─ Creates TeacherAgent instance                                            │
│  ├─ Async generator yields TeacherEvent objects                              │
│  └─ StreamingResponse sends NDJSON to client                                 │
│                                                                               │
│  ai_teacher/agent.py                                                          │
│  ├─ TeacherAgent.stream_lesson()                                             │
│  │  ├─ Fetches user customizations (name, traits, language)                  │
│  │  ├─ Builds LLM prompt with:                                               │
│  │  │  • System prompt (teaching style, runtime constraints)                  │
│  │  │  • User prompt (topic, audience, constraints)                          │
│  │  │  • Format specification (narration + TSX code)                         │
│  │  ├─ Calls LLM (GPT-5):                                                    │
│  │  │  • Input: Messages with prompt                                         │
│  │  │  • Output: Narration text + TSX code                                   │
│  │  ├─ Parses response:                                                      │
│  │  │  • Extracts <narration> tag                                            │
│  │  │  • Extracts TSX code block                                             │
│  │  ├─ Normalizes code:                                                      │
│  │  │  • Removes imports                                                     │
│  │  │  • Converts export default → module.exports                            │
│  │  │  • Validates component structure                                       │
│  │  ├─ Yields render event (code + initial timeline)                         │
│  │  ├─ Synthesizes TTS (Cartesia):                                           │
│  │  │  • Input: Narration text                                               │
│  │  │  • Output: Audio file + word timestamps                                │
│  │  ├─ Builds timeline:                                                      │
│  │  │  • Divides narration into segments                                     │
│  │  │  • Creates timeline events from word timestamps                        │
│  │  ├─ Yields updated render event (code + precise timeline)                 │
│  │  ├─ Yields speak event (audio_url + segments)                             │
│  │  └─ Yields final event                                                    │
│  └─ Returns AsyncGenerator[TeacherEvent]                                     │
│                                                                               │
│  External Services:                                                           │
│  ├─ OpenAI API (LLM generation)                                              │
│  └─ Cartesia API (TTS synthesis)                                             │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Event Flow Sequence

```
1. User submits topic
   │
   ▼
2. AITeacherSession mounts → startStreaming()
   │
   ▼
3. POST /teacher/stream { topic, user_id, session_id, tts: true }
   │
   ▼
4. Backend: TeacherAgent.stream_lesson()
   │
   ├─► Fetch user customizations
   │
   ├─► Build LLM prompt
   │
   ├─► Call LLM (GPT-5) ──────────────┐
   │                                   │
   │                                   ▼
   │                            Generate narration + TSX
   │                                   │
   │                                   ▼
   ├─► Parse response                  │
   │                                   │
   ├─► Normalize code                  │
   │                                   │
   ├─► Emit render event ──────────────┼──► Frontend receives render event
   │   { code, timeline: [...] }       │    └─► CodeSlideRuntime compiles & renders
   │                                   │
   ├─► Synthesize TTS (Cartesia) ──────┐
   │                                   │
   │                                   ▼
   │                            Generate audio + word timestamps
   │                                   │
   │                                   ▼
   ├─► Build timeline from timestamps  │
   │                                   │
   ├─► Emit updated render event ──────┼──► Frontend updates timeline
   │   { code, timeline: [precise] }   │
   │                                   │
   ├─► Emit speak event ───────────────┼──► Frontend receives speak event
   │   { audio_url, segments, ... }    │    └─► Audio player loads & plays
   │                                   │
   └─► Emit final event ───────────────┼──► Frontend marks session complete
                                       │
                                       ▼
5. Audio plays → timeSeconds updates → CodeSlideRuntime re-renders
   → Visuals animate based on timeline events
```

---

## Step 1: User Submission (Frontend - LearningInterface.tsx)

### Location: `app/src/pages/LearningInterface.tsx`

**When the user types and submits:**

```62:79:app/src/pages/LearningInterface.tsx
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      if (selectedMode === 'interactive') {
        // Start AI Teacher session
        setCurrentTopic(inputValue.trim())
        setIsTeaching(true)
        setInputValue('')
      } else if (selectedMode === 'research') {
        setResearchInitialQuestion(inputValue.trim())
        setInputValue('')
      } else {
        // Handle other modes (read/research)
        console.log('Learning request:', inputValue, 'Mode:', selectedMode)
        setInputValue('')
      }
    }
  }
```

**What happens:**
1. User enters text in the input field (e.g., "What is React?")
2. User clicks submit or presses Enter
3. `handleSubmit` is called
4. If mode is `'interactive'`, the component:
   - Sets `currentTopic` to the trimmed input
   - Sets `isTeaching` to `true`
   - Clears the input field

**Result:** The component conditionally renders `AITeacherSession` instead of the input form.

---

## Step 2: Component Transition (AITeacherSession Mounts)

### Location: `app/src/components/ai-teacher/AITeacherSession.tsx`

**When `isTeaching` becomes true:**

```124:144:app/src/pages/LearningInterface.tsx
  if (isTeaching && currentTopic) {
    return (
      <div className="flex-1 flex flex-col p-4">
        <div className="mb-4">
          <button
            onClick={handleTeachingComplete}
            className="text-gray-600 hover:text-gray-800 transition-colors"
          >
            ← Back to learning
          </button>
        </div>
        <div className="flex-1">
          <AITeacherSession
            topic={currentTopic}
            userId="current-user" // TODO: Get from auth context
            onComplete={handleTeachingComplete}
            onError={handleTeachingError}
          />
        </div>
      </div>
    )
  }
```

**AITeacherSession component receives:**
- `topic`: The user's learning request
- `userId`: User identifier (currently hardcoded)
- `onComplete`: Callback when lesson finishes
- `onError`: Callback for error handling

**On mount, AITeacherSession:**
1. Initializes state for session, error, and loading
2. Sets up audio player hooks (`useAudioPlayer`)
3. Sets up streaming hook (`useTeacherStream`)
4. **Immediately starts streaming** via `useEffect`

```142:149:app/src/components/ai-teacher/AITeacherSession.tsx
  // Start streaming on mount (guard StrictMode double invoke)
  useEffect(() => {
    try { console.log('AITeacherSession:mount') } catch {}
    if (!didStartRef.current) {
      didStartRef.current = true
      startStreamingWrapped()
    }
  }, [startStreamingWrapped])
```

---

## Step 3: Streaming Hook Setup (useTeacherStream)

### Location: `app/src/components/ai-teacher/hooks/useTeacherStream.ts`

**The hook prepares the streaming request:**

```16:47:app/src/components/ai-teacher/hooks/useTeacherStream.ts
  const startStreaming = useCallback(async () => {
    setIsLoading(true)
    try {
      const request: StreamLessonRequest = {
        topic,
        user_id: userId,
        session_id: `teacher_${userId || 'anon'}_${Date.now()}`,
        tts: true,
        language: 'en'
      }

      if (streamAbortRef.current) {
        streamAbortRef.current.abort()
      }
      streamAbortRef.current = new AbortController()

      await apiService.streamTeacherLesson({
        request,
        onEvent,
        onError: (e) => { setIsLoading(false); onError?.(e) },
        onDone: () => { setIsLoading(false); onDone?.() },
        signal: streamAbortRef.current?.signal
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        try { console.log('useTeacherStream: aborted') } catch {}
      } else {
        onError?.(err)
      }
      setIsLoading(false)
    }
  }, [topic, userId, onEvent, onError, onDone])
```

**Request structure:**
- `topic`: The learning topic
- `user_id`: User identifier
- `session_id`: Unique session ID (timestamp-based)
- `tts`: Enable text-to-speech
- `language`: Language code (default 'en')

**AbortController:** Allows canceling the stream if the component unmounts or topic changes.

---

## Step 4: API Service - HTTP Streaming Request

### Location: `app/src/services/api.ts`

**The API service makes the actual HTTP request:**

```429:465:app/src/services/api.ts
  // AI Teacher Streaming (NDJSON via fetch for readable stream) - Direct to Python service
  async streamTeacherLesson(params: {
    request: StreamLessonRequest;
    onEvent: (evt: TeacherEvent) => void;
    onError?: (error: Error) => void;
    onDone?: () => void;
    signal?: AbortSignal;
  }): Promise<void> {
    const { request, onEvent, onError, onDone, signal } = params
    try {
      const url = `${process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:8003'}/teacher/stream`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/plain; charset=utf-8',
      }

      // Get auth token and add it to the request
      const token = localStorage.getItem('workos_access_token') || localStorage.getItem('authToken')
      if (token) {
        request.auth_token = token
      }

      try { console.log('apiService.streamTeacherLesson: starting', { url, to: (process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:8003') }) } catch {}
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        // Be explicit to avoid browser/network intermediaries interfering with the stream
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        keepalive: false,
        signal,
        body: JSON.stringify(request),
      })
      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '')
        throw new Error(`Teacher stream failed (${resp.status}): ${text}`)
      }
```

**Key details:**
1. **Endpoint:** `POST /teacher/stream` on the Python orchestrator service (default: `http://localhost:8003`)
2. **Auth token:** Retrieved from localStorage and added to request
3. **Streaming:** Uses `fetch` with `resp.body` as a ReadableStream
4. **NDJSON format:** Each line is a JSON object (Newline Delimited JSON)

**Streaming response parsing:**

```483:515:app/src/services/api.ts
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // split by newlines for NDJSON
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const evt = JSON.parse(trimmed) as TeacherEvent
            try { console.log('apiService.streamTeacherLesson: event', { type: (evt as any)?.type, seq: (evt as any)?.seq }) } catch {}
            onEvent(evt)
          } catch (e) {
            // Fallback: treat as error
            try { console.warn('apiService.streamTeacherLesson: non-JSON line', trimmed.slice(0, 160)) } catch {}
            onEvent({ type: 'error', message: trimmed })
          }
        }
      }
      if (buffer.trim()) {
        try {
          onEvent(JSON.parse(buffer.trim()))
        } catch {
          onEvent({ type: 'error', message: buffer.trim() })
        }
      }
      try { console.log('apiService.streamTeacherLesson: done') } catch {}
      onEvent({ type: 'done' })
      onDone?.()
```

**How NDJSON streaming works:**
1. Read chunks from the stream
2. Decode bytes to text
3. Buffer text until newlines are found
4. Parse each complete line as JSON
5. Call `onEvent` for each parsed event
6. Continue until stream closes

---

## Step 5: Python Backend - FastAPI Router

### Location: `python_services/ai_teacher/api.py`

**The FastAPI router receives the request:**

```26:55:python_services/ai_teacher/api.py
    @router.post("/stream")
    async def stream(req: StreamLessonRequest):
        agent = TeacherAgent()

        async def gen() -> AsyncGenerator[str, None]:
            # Immediate open
            yield json.dumps({"type": "start"}) + "\n"
            try:
                print(f"[TeacherAPI] /teacher/stream opened for topic='{req.topic}' user='{req.user_id}'")
            except Exception:
                pass
            try:
                async for ev in agent.stream_lesson(req):
                    try:
                        print(f"[TeacherAPI] emit event type={ev.type} seq={getattr(ev, 'seq', None)}")
                    except Exception:
                        pass
                    yield ev.model_dump_json() + "\n"
                yield json.dumps({"type": "done"}) + "\n"
            except Exception as e:  # noqa: BLE001
                try:
                    print(f"[TeacherAPI] stream error: {e}")
                except Exception:
                    pass
                yield json.dumps({"type": "error", "message": str(e)}) + "\n"
            finally:
                # occasional heartbeat while client processes
                await asyncio.sleep(0)

        return StreamingResponse(gen(), media_type="text/plain")
```

**What happens:**
1. **Router receives:** `StreamLessonRequest` with topic, user_id, session_id, etc.
2. **Creates TeacherAgent:** Instantiates the agent that will generate the lesson
3. **Streaming generator:** Async generator function that:
   - Immediately yields `{"type": "start"}` to open the stream
   - Iterates over events from `agent.stream_lesson(req)`
   - Yields each event as NDJSON (JSON string + newline)
   - Yields `{"type": "done"}` when complete
   - Yields error event if exception occurs
4. **Returns StreamingResponse:** FastAPI streams the generator to the client

**Router is mounted in:** `python_services/slide_orchestrator/api_server.py`

```35:41:python_services/slide_orchestrator/api_server.py
# Mount AI Teacher router (sibling package import)
try:
    from ai_teacher import get_router as get_teacher_router  # type: ignore
    app.include_router(get_teacher_router())
except Exception as _e:
    # Leave other endpoints functional even if teacher router fails to import
    print(f"[api_server] AI Teacher router not mounted: {_e}")
```

---

## Step 6: TeacherAgent - Lesson Generation Engine

### Location: `python_services/ai_teacher/agent.py`

**This is the core of lesson generation. Let's break it down:**

### 6.1: Session Setup

```73:92:python_services/ai_teacher/agent.py
    async def stream_lesson(self, req: StreamLessonRequest) -> AsyncGenerator[TeacherEvent, None]:
        try:
            print(f"[TeacherAgent] stream_lesson start topic='{req.topic}' user='{req.user_id}' session='{req.session_id}' tts={req.tts}")
        except Exception:
            pass
        # Prepare session
        session_id = req.session_id or f"teacher_{req.user_id or 'anon'}"
        state = session_state.ensure(session_id)
        state["topic"] = req.topic
        state["user_id"] = req.user_id

        # Fetch user customizations for personalized teaching
        user_customizations = await self.fetch_user_customizations(req.user_id, req.auth_token)
        try:
            print(f"[TeacherAgent] fetched customizations ok={bool(user_customizations)}")
        except Exception:
            pass

        # Announce session
        yield TeacherEvent(type="session", session_id=session_id, message="session started", seq=session_state.next_seq(session_id))
```

**What happens:**
1. **Session state:** Creates/retrieves session state (stores topic, user_id, etc.)
2. **User customizations:** Fetches user preferences (name, occupation, traits, language) from main server API
3. **Session event:** Yields a session event to notify the frontend

### 6.2: Building the LLM Prompt

**The agent constructs a detailed system prompt:**

```115:136:python_services/ai_teacher/agent.py
        # Build planning prompt
        system = (
            f"You are a master teacher. Develop and deliver a dynamic teaching segment that feels like a smooth, cinematic YouTube video. "
            f"Return TWO sections only: narration and TSX code. The visuals MUST be React-friendly and feel continuously animated (not just discrete beats). "
            f"{user_context}"
            "RUNTIME CONTRACT (STRICT):\n"
            "- Environment: React web runtime with Babel (no bundler).\n"
            "- Allowed elements ONLY: div, span, p, h1, h2, h3, img, button, svg, rect, circle, line, path, text.\n"
            "- Props available to your component: { slide, showCaptions, isPlaying, timeSeconds, timeline }.\n"
            "- Use inline styles only (backgroundColor, color, fontSize, padding, margin, etc.).\n"
            "- NO imports, NO require, NO external libraries, NO hooks beyond JSX itself.\n"
            "- DO NOT use React Native primitives like View/Text/Image.\n"
            "- CRITICAL: Use stable keys and avoid dynamic component creation to prevent React errors.\n"
            "MOTION HELPERS AVAILABLE (no import needed):\n"
            "- motion.time (alias of timeSeconds), motion.lerp(a,b,t), motion.clamp(x,min,max), motion.easeInOut(t), motion.phaseProgress(phaseIndexOrName).\n"
            "CINEMATICS & SYNC:\n"
            "- Use timeline events as anchors; animate between them using motion.phaseProgress(...).\n"
            "- Keep subtle movement active (parallax blobs, gentle drifts) and use transform-based motion (translate/scale/rotate).\n"
            "- Favor time-driven styles derived from timeSeconds over pure CSS transitions.\n"
            "- Keep TSX under ~120 lines.\n"
            f"TONE: Adapt your teaching style to {user_customizations.get('displayName', 'the learner') if user_customizations else 'the learner'}; keep it cool and encouraging."
        )
```

**User prompt:**

```142:147:python_services/ai_teacher/agent.py
        user = (
            f"Topic: {req.topic}\n"
            f"Audience: {learner_name}, a motivated beginner.\n"
            f"Goal: explain the core idea with one concrete example and a simple visual layout.\n"
            "Constraints: 120-180 words narration; TSX under ~80 lines; no external fetches."
        )
```

**Format specification:**

```155:195:python_services/ai_teacher/agent.py
        prompt = (
            "Return in this exact format:\n\n"
            "Narration:\n"
            "<narration>...teacher speaking text...</narration>\n\n"
            "Code:\n"
            "```tsx\nfunction Lesson({ slide, showCaptions, isPlaying, timeSeconds, timeline }) {\n"
            "  // Use motion helpers for continuous, time-driven animation\n"
            "  const t = (typeof motion !== 'undefined' && motion.time != null) ? motion.time : (timeSeconds || 0);\n"
            "  const p1 = (typeof motion !== 'undefined' && motion.phaseProgress) ? motion.phaseProgress(1) : 0;\n"
            "  const p2 = (typeof motion !== 'undefined' && motion.phaseProgress) ? motion.phaseProgress(2) : 0;\n"
            "  const ease = (x) => (typeof motion !== 'undefined' && motion.easeInOut ? motion.easeInOut(x) : x);\n"
            "  // Title slides in then gently floats\n"
            "  const titleEnter = ease(Math.min(1, p1));\n"
            "  const titleX = -40 * (1 - titleEnter) + Math.sin(t * 0.4) * 2;\n"
            "  const titleOpacity = 0.25 + 0.75 * titleEnter;\n"
            "  // Bars expand smoothly across phases\n"
            "  const bar1W = 160 + (typeof motion !== 'undefined' ? motion.lerp(0, 260, ease(p1)) : 260 * ease(p1));\n"
            "  const bar2W = 140 + (typeof motion !== 'undefined' ? motion.lerp(0, 220, ease(p2)) : 220 * ease(p2));\n"
            "  // Background drift\n"
            "  const driftX = Math.sin(t * 0.6) * 8;\n"
            "  const driftY = Math.cos(t * 0.5) * 6;\n"
            "  return (\n"
            "    <div style={{ padding: '24px', backgroundColor: '#0f172a', color: '#e2e8f0', minHeight: '400px', fontFamily: 'Inter, Arial, sans-serif' }}>\n"
            "      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#60a5fa', marginBottom: 12, transform: `translateX(${titleX}px)`, opacity: titleOpacity, transition: 'opacity 0.2s linear' }}>{slide?.title || 'Lesson'}</h1>\n"
            "      <div style={{ marginTop: 12 }}>\n"
            "        <svg width='100%' height='220' viewBox='0 0 800 220'>\n"
            "          <rect x='0' y='0' width='800' height='220' fill='#0b1220' stroke='#1f2a44' />\n"
            "          <circle cx={120 + driftX} cy={110 + driftY} r='38' fill='#22c55e' opacity={0.85} />\n"
            "          <rect x='200' y='72' width={bar1W} height='28' rx='6' fill='#334155' />\n"
            "          <rect x='200' y='112' width={bar2W} height='24' rx='6' fill='#1f2a44' />\n"
            "          <text x='200' y='60' fill='#94a3b8' fontSize='14'>Core idea</text>\n"
            "        </svg>\n"
            "      </div>\n"
            "    </div>\n"
            "  );\n"
            "}\n\n"
            "// Export the component for the runtime\n"
            "module.exports = Lesson;\n"
            "```\n"
            "Guidance: 120–180 words. Use ONLY basic HTML/SVG. Favor continuous, timeSeconds-driven transforms with motion.* helpers (phaseProgress, easeInOut, lerp). IMPORTANT: Use 'function Lesson(...)' (not export default) and end with 'module.exports = Lesson;'. Do NOT use React Native components."
        )
```

### 6.3: LLM Generation

**The agent calls the LLM (default: GPT-5):**

```198:215:python_services/ai_teacher/agent.py
        # Generate using OpenAI only (no fallback) and GPT‑5 by default
        try:
            print("[TeacherAgent] calling LLM for narration+code…")
        except Exception:
            pass
        text, _provider = await self.llm.generate_response(
            messages=[type("Msg", (), {"role": type("Role", (), {"value": m["role"]}), "content": m["content"]}) for m in messages],
            preferred_provider=LLMProvider.OPENAI,
            model=req.model or OPENAI_GPT5_MODEL,
            allow_fallback=False,
            max_tokens=2048,
            temperature=0.7,
        )
        try:
            preview = (text or "").strip()[:200].replace("\n", " ")
            print(f"[TeacherAgent] LLM response preview: {preview}…")
        except Exception:
            pass
```

**LLM parameters:**
- **Model:** GPT-5 (or specified model)
- **Temperature:** 0.7 (balanced creativity)
- **Max tokens:** 2048
- **Provider:** OpenAI only (no fallback)

**The LLM returns:**
- Narration text (120-180 words)
- TSX code (React component)

### 6.4: Parsing LLM Response

**Extract narration and code:**

```217:246:python_services/ai_teacher/agent.py
        narration = tsx_extract_tag(text, "narration") or text.strip()[:220]
        extracted = tsx_extract_code_block(text)
        code = (extracted if extracted else (
            "function Lesson({ slide, showCaptions, isPlaying, timeSeconds, timeline }) {\n"
            "  // Stable computation to prevent re-render issues\n"
            "  const timelineArray = timeline || [];\n"
            "  const currentTime = timeSeconds || 0;\n"
            "  const fired = new Set(timelineArray.filter(t => (t?.at ?? 0) <= currentTime).map(t => t.event));\n"
            "  const showIntro = fired.has('intro') || fired.size === 0;\n"
            "  const beat2 = Array.from(fired).some(e => (e||'').includes('reveal:1') || (e||'').includes('reveal:main'));\n"
            "  const beat3 = Array.from(fired).some(e => (e||'').includes('reveal:2'));\n"
            "  const beat4 = Array.from(fired).some(e => (e||'').includes('reveal:3'));\n"
            "  \n"
            "  return (\n"
            "    <div style={{ padding: '24px', backgroundColor: '#0f172a', color: '#e2e8f0', minHeight: '400px', fontFamily: 'Inter, Arial, sans-serif' }}>\n"
            "      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#60a5fa', marginBottom: 12 }}>{slide?.title || 'Lesson'}</h1>\n"
            "      {showIntro ? (<p style={{ opacity: 0.95, transition: 'opacity 0.3s ease' }}>Preparing interactive lesson…</p>) : null}\n"
            "      <div style={{ marginTop: 16 }}>\n"
            "        <svg width='100%' height='220' viewBox='0 0 800 220'>\n"
            "          <rect x='0' y='0' width='800' height='220' fill='#0b1220' stroke='#1f2a44' />\n"
            "          <circle cx='120' cy='110' r='38' fill={beat2 ? '#22c55e' : '#334155'} style={{ transition: 'fill 0.3s ease' }} />\n"
            "          <rect x='200' y='72' width={beat3 ? 420 : 180} height='28' rx='6' fill='#334155' style={{ transition: 'width 0.3s ease' }} />\n"
            "          <rect x='200' y='112' width={beat4 ? 360 : 140} height='24' rx='6' fill='#1f2a44' style={{ transition: 'width 0.3s ease' }} />\n"
            "        </svg>\n"
            "      </div>\n"
            "    </div>\n"
            "  );\n"
            "}\n\n"
            "module.exports = Lesson;"
        ))
```

**What happens:**
1. **Extract narration:** Parses `<narration>...</narration>` tag, or falls back to first 220 characters
2. **Extract code:** Parses TSX code block from markdown fences
3. **Fallback code:** If extraction fails, uses a safe default component

### 6.5: Code Normalization

**Normalize TSX for bundler-free execution:**

```248:268:python_services/ai_teacher/agent.py
        # Normalize TSX for bundler-free execution
        try:
            before_len = len(code or "")
            code = tsx_normalize(code)
            after_len = len(code or "")
            head = (code or "")[:140].replace("\n", " ")
            print(f"[TeacherAgent] normalized TSX len {before_len}→{after_len} head='{head}'")
        except Exception as e:
            print(f"[TeacherAgent] normalize TSX failed: {e}")

        # Contract enforcement: if code seems non-compliant or empty, replace with a safe cinematic baseline
        try:
            non_empty = bool(code and isinstance(code, str) and len(code.strip()) > 40)
            has_module_exports = ("module.exports" in (code or ""))
            looks_like_component = ("function " in (code or "") and "return (" in (code or ""))
            if not (non_empty and has_module_exports and looks_like_component):
                from .fixer import generate_safe_cinematic_tsx
                print("[TeacherAgent] code non-compliant → using safe cinematic TSX")
                code = generate_safe_cinematic_tsx(title=f"Lesson: {req.topic}")
        except Exception as _e:
            pass
```

**Normalization includes:**
- Removing imports
- Converting `export default` to `module.exports`
- Ensuring CommonJS format
- Validating component structure

### 6.6: Emit Render Event

**Send render event with code to frontend:**

```280:298:python_services/ai_teacher/agent.py
        # Emit render first so UI can show content while TTS processes
        # Use a basic timeline that will be updated after TTS processing
        try:
            print("[TeacherAgent] emit render (initial) + minimal timeline")
        except Exception:
            pass
        yield TeacherEvent(
            type="render",
            session_id=session_id,
            seq=session_state.next_seq(session_id),
            render=RenderPayload(
                title=f"Lesson: {req.topic}",
                markdown=None,
                code=code,
                language="tsx",
                runtime_hints={"progressive": True},
                timeline=[{"at": 0, "event": "intro"}],  # Start with just intro, will be updated with precise timing
            ),
        )
```

**Render event contains:**
- **title:** Lesson title
- **code:** TSX component code
- **language:** "tsx"
- **timeline:** Initial timeline (will be updated after TTS)

### 6.7: Text-to-Speech Synthesis

**If TTS is enabled, synthesize audio:**

```300:323:python_services/ai_teacher/agent.py
        speak_payload = SpeakPayload(text=narration, start_at=0)
        if req.tts:
            try:
                # Cartesia TTS with word timestamps
                result_full = await synthesize_cartesia_tts(
                    narration,
                    voice_id=(req.preferred_voice or os.environ.get("CARTESIA_VOICE_ID")),
                    model_id=os.environ.get("CARTESIA_TTS_MODEL", "sonic-2"),
                    language=(req.language or os.environ.get("CARTESIA_LANGUAGE", "en")),
                    format=os.environ.get("CARTESIA_AUDIO_FORMAT", "mp3"),
                    filename_prefix=f"teacher_{session_id}",
                    add_timestamps=True,
                    speed=os.environ.get("CARTESIA_SPEED", "normal"),
                )
                speak_payload.audio_url = result_full.get("public_url")
                speak_payload.duration_seconds = result_full.get("duration_seconds")
                speak_payload.model = result_full.get("model")
                speak_payload.voice = result_full.get("voice")
                speak_payload.word_timestamps = result_full.get("word_timestamps")
                try:
                    print(f"[TeacherAgent] TTS ok url={speak_payload.audio_url} dur={speak_payload.duration_seconds}s words={len(speak_payload.word_timestamps or [])}")
                except Exception:
                    pass
```

**TTS details:**
- **Provider:** Cartesia TTS
- **Model:** "sonic-2" (default)
- **Format:** MP3
- **Word timestamps:** Enabled for precise synchronization
- **Output:** Audio file saved to storage, public URL returned

### 6.8: Timeline Generation

**Build timeline events from word timestamps:**

```324:339:python_services/ai_teacher/agent.py
                segments: List[SpeakSegment] = []
                timeline_events: List[Dict[str, Any]] = []
                if speak_payload.word_timestamps:
                    segs, evs = build_segments_from_word_timestamps(narration, speak_payload.word_timestamps or [])
                else:
                    total_duration = speak_payload.duration_seconds or max(8.0, len(narration.split()) * 0.62)
                    segs, evs = build_segments_naive(narration, float(total_duration))
                for s in segs:
                    segments.append(SpeakSegment(text=s.get("text", ""), start_at=float(s.get("start_at", 0.0)), duration_seconds=float(s.get("duration_seconds", 0.0))))
                timeline_events = evs

                speak_payload.segments = segments
                try:
                    print(f"[TeacherAgent] computed {len(segments)} segments, updating timeline events={len(timeline_events)}")
                except Exception:
                    pass
```

**Timeline building:**
- **With word timestamps:** Divides narration into ~4 segments, creates timeline events at segment boundaries
- **Without timestamps:** Uses naive sentence-based segmentation
- **Events:** `{"at": time_seconds, "event": "reveal:1"}` format

**Update render event with precise timeline:**

```340:357:python_services/ai_teacher/agent.py
                # Emit an updated render with precise timeline aligned to voice
                try:
                    print("[TeacherAgent] emit render (updated timeline)")
                except Exception:
                    pass
                yield TeacherEvent(
                    type="render",
                    session_id=session_id,
                    seq=session_state.next_seq(session_id),
                    render=RenderPayload(
                        title=f"Lesson: {req.topic}",
                        markdown=None,
                        code=code,
                        language="tsx",
                        runtime_hints={"progressive": True, "beats": len(segments)},
                        timeline=[{"at": 0, "event": "intro"}] + timeline_events,
                    ),
                )
```

### 6.9: Emit Speak Event

**Send speak event with audio URL:**

```361:370:python_services/ai_teacher/agent.py
        try:
            print("[TeacherAgent] emit speak + final")
        except Exception:
            pass
        yield TeacherEvent(
            type="speak",
            session_id=session_id,
            seq=session_state.next_seq(session_id),
            speak=speak_payload,
        )
```

**Speak event contains:**
- **text:** Narration text
- **audio_url:** URL to synthesized audio file
- **duration_seconds:** Audio duration
- **segments:** Timed segments for captioning
- **word_timestamps:** Per-word timing for synchronization

### 6.10: Final Event

**Emit final event to signal completion:**

```372:373:python_services/ai_teacher/agent.py
        # Final signal (iteration 1 ends here)
        yield TeacherEvent(type="final", session_id=session_id, seq=session_state.next_seq(session_id), message="lesson segment complete")
```

---

## Step 7: Frontend Event Processing

### Location: `app/src/components/ai-teacher/AITeacherSession.tsx`

**Events are processed in `handleTeacherEvent`:**

```57:127:app/src/components/ai-teacher/AITeacherSession.tsx
  // Handle teacher events
  const handleTeacherEvent = useCallback((event: TeacherEvent) => {
    setSession(prev => {
      // Create session if it doesn't exist (or update if new topic/session_id)
      let currentSession = prev || {
        sessionId: event.session_id || `teacher_${userId || 'anon'}_${Date.now()}`,
        topic,
        userId,
        status: 'active',
        isPlaying: false,
        timeSeconds: 0,
        renderCode: '',
        timeline: [],
        audioUrl: '',
        currentEvent: event,
      }

      // Always update sessionId if a new one comes from the backend
      if (event.session_id) currentSession.sessionId = event.session_id;

      const updated = { ...currentSession }

      switch (event.type) {
        case 'start':
          updated.status = 'active'
          break

        case 'render':
          if (event.render) {
            updated.renderCode = event.render.code || updated.renderCode // Keep old code if new is empty
            updated.timeline = event.render.timeline || updated.timeline
          }
          break

        case 'speak':
          if (event.speak) {
            const resolveAudioUrl = (url?: string) => {
              if (!url) return undefined
              if (/^https?:/i.test(url)) return url
              try {
                const { protocol, hostname } = window.location
                const base = `${protocol}//${hostname}:8003`
                return `${base}${url}`
              } catch {
                return url
              }
            }

            const resolvedUrl = resolveAudioUrl(event.speak.audio_url)
            updated.audioUrl = resolvedUrl
            if (resolvedUrl && resolvedUrl !== currentAudioUrlRef.current) {
              currentAudioUrlRef.current = resolvedUrl
              requestPlay(resolvedUrl)
            }
          }
          break

        case 'error':
          updated.status = 'error'
          setError(event.message || 'Unknown error occurred')
          break

        case 'final':
          updated.status = 'completed'
          // Don't show replay here - let audio 'ended' event handle it
          break
      }

      updated.currentEvent = event
      return updated
    })
  }, [topic, userId])
```

**Event handling:**
1. **start:** Sets status to 'active'
2. **render:** Updates `renderCode` and `timeline` in session state
3. **speak:** Resolves audio URL and triggers audio playback
4. **error:** Sets error state
5. **final:** Marks session as completed

---

## Step 8: Code Rendering (CodeSlideRuntime)

### Location: `app/src/components/ai-teacher/CodeSlideRuntime.tsx`

**When renderCode is available, CodeSlideRuntime renders it:**

```213:234:app/src/components/ai-teacher/AITeacherSession.tsx
      {/* Main content area */}
      <div className="absolute inset-0">
        {session.renderCode ? (
          <CodeSlideRuntime
            code={session.renderCode}
            sessionId={session.sessionId}
            userId={session.userId}
            topic={session.topic}
            timeline={session.timeline}
            isPlaying={isPlaying}
            timeSeconds={timeSeconds}
            onError={handleRenderError}
            onRenderComplete={() => {
              console.log('AITeacherSession: Render completed')
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Preparing visuals...</p>
            </div>
          </div>
        )}
      </div>
```

**CodeSlideRuntime process:**

1. **Compilation:** Uses Babel standalone to transpile TSX to JavaScript
2. **Execution:** Executes the compiled code in a sandboxed environment
3. **Component extraction:** Extracts the `Lesson` component from `module.exports`
4. **React rendering:** Renders the component with props:
   - `slide`: { title: topic }
   - `showCaptions`: true
   - `isPlaying`: current play state
   - `timeSeconds`: current audio time
   - `timeline`: timeline events for synchronization

**Key features:**
- **Real-time updates:** Component re-renders as `timeSeconds` changes
- **Timeline sync:** Component uses timeline events to trigger animations
- **Error handling:** Reports errors to backend for auto-fix
- **Motion helpers:** Provides `motion.*` utilities for animations

---

## Step 9: Audio Playback Synchronization

### Location: `app/src/components/ai-teacher/hooks/useAudioPlayer.ts`

**Audio player manages playback and time tracking:**

- **Playback:** Uses HTML5 Audio API
- **Time tracking:** Updates `timeSeconds` as audio plays
- **Synchronization:** `timeSeconds` drives visual animations
- **Replay:** Shows replay overlay when audio ends

**Flow:**
1. Audio URL received from `speak` event
2. Audio element created and loaded
3. Playback starts (auto-play or user-triggered)
4. `timeSeconds` updates via `timeupdate` event
5. CodeSlideRuntime receives updated `timeSeconds`
6. Component re-renders with new time
7. Animations sync to timeline events

---

## Summary: Complete Data Flow

```
1. User submits topic in LearningInterface
   ↓
2. AITeacherSession mounts and calls useTeacherStream
   ↓
3. apiService.streamTeacherLesson makes POST /teacher/stream
   ↓
4. Python FastAPI router receives request
   ↓
5. TeacherAgent.stream_lesson() starts:
   - Fetches user customizations
   - Builds LLM prompt with constraints
   - Calls LLM (GPT-5) to generate narration + TSX code
   - Normalizes code for bundler-free execution
   - Emits render event with code
   - Synthesizes TTS audio (Cartesia)
   - Builds timeline from word timestamps
   - Emits updated render event with timeline
   - Emits speak event with audio URL
   - Emits final event
   ↓
6. Frontend receives NDJSON events via stream
   ↓
7. handleTeacherEvent processes events:
   - render → updates renderCode and timeline
   - speak → resolves audio URL and starts playback
   ↓
8. CodeSlideRuntime:
   - Compiles TSX to JS (Babel)
   - Executes code in sandbox
   - Renders Lesson component with props
   ↓
9. Audio playback:
   - Updates timeSeconds as audio plays
   - CodeSlideRuntime re-renders with new time
   - Component animates based on timeline events
   ↓
10. Lesson completes, replay overlay shown
```

---

## Key Technical Concepts

### 1. **NDJSON Streaming**
- **Format:** Newline Delimited JSON (one JSON object per line)
- **Benefits:** Real-time event streaming, low latency
- **Implementation:** FastAPI `StreamingResponse` + Fetch API `ReadableStream`

### 2. **Bundler-Free Runtime**
- **Challenge:** Execute TSX code without a build step
- **Solution:** Babel standalone (browser-based transpilation)
- **Constraints:** No imports, CommonJS only, inline styles

### 3. **Timeline Synchronization**
- **Word timestamps:** Precise timing from TTS
- **Timeline events:** Markers for visual animations
- **Time-driven animation:** Component receives `timeSeconds` prop

### 4. **Error Recovery**
- **Frontend:** Reports render errors to backend
- **Backend:** Attempts auto-fix via `/teacher/render-error` endpoint
- **Fallback:** Safe cinematic TSX if fix fails

### 5. **Personalization**
- **User customizations:** Fetched from main server API
- **LLM prompt:** Includes user name, occupation, traits, language
- **Teaching style:** Adapts to user preferences

---

## Performance Considerations

1. **Streaming:** Events sent as soon as ready (no waiting for full generation)
2. **Progressive rendering:** Visuals appear before audio is ready
3. **Caching:** Audio files cached by browser
4. **Error handling:** Graceful degradation if TTS fails
5. **Memory:** Session state cleaned up on unmount

---

## Future Enhancements

- **Multi-segment lessons:** Multiple render/speak pairs
- **Interactive elements:** Clickable components in lessons
- **Adaptive pacing:** Adjust speed based on user comprehension
- **Offline support:** Cache lessons for offline playback
- **Multi-language:** Support for more languages and voices

