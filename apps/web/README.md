## Web App (Next.js)

### Overview
This is the frontend for Voice Chat AI. It connects to the backend Socket.IO server for real-time audio streaming and AI responses.

### Environment
Create `apps/web/.env`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

In production:
```env
NEXT_PUBLIC_API_URL=https://fassix.com:12004
```

### Development
```bash
pnpm dev
```
Open `http://localhost:3000`.

### Configuration
- The backend URL is read from `NEXT_PUBLIC_API_URL`.
- If deploying under a subpath (e.g., `/voice`), uncomment `basePath` and `assetPrefix` in `next.config.js` and configure nginx accordingly.

### Permissions and Audio
- The app requests microphone permissions using `getUserMedia`.
- Recommended constraints (browser defaults apply): echoCancellation, noiseSuppression, autoGainControl.
- Audio is recorded with `MediaRecorder` and sent as ArrayBuffers via Socket.IO.

### UX
- Natural conversation flow with barge‑in: you can start speaking while the AI is talking to interrupt playback.
- Typing indicator and message stream with timestamps.
