# Technical Architecture

## System Overview

Voice-chat-ai is a real-time voice conversation application using a monorepo structure with Next.js frontend and Node.js backend.

## Project Structure

```
voice-chat-ai/
├── apps/
│   ├── web/                    # Next.js frontend (Port 3000)
│   │   ├── src/
│   │   │   ├── app/           # App Router pages
│   │   │   │   ├── layout.tsx # Root layout with fonts
│   │   │   │   ├── page.tsx   # Main chat interface
│   │   │   │   └── globals.css # Global styles
│   │   │   └── components/    # React components
│   │   ├── package.json       # Frontend dependencies
│   │   └── next.config.js     # Next.js configuration
│   └── api/                   # Node.js backend (Port 3001)
│       ├── src/
│       │   └── index.ts       # Express + Socket.IO server
│       ├── package.json       # Backend dependencies
│       └── .env              # Environment variables
├── packages/
│   └── shared/               # Shared types and utilities
│       ├── src/
│       │   └── index.ts      # Common interfaces
│       └── package.json
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # pnpm workspace definition
└── tsconfig.json            # Global TypeScript config
```

## Architecture Components

### Frontend (Next.js 14)
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Inline styles (iPhone-style UI)
- **Real-time**: Socket.IO client
- **Audio**: Web Audio API + MediaRecorder
- **Port**: 3000

### Backend (Node.js)
- **Framework**: Express.js + Socket.IO
- **Language**: TypeScript
- **AI Integration**: OpenAI gpt-4o-mini + Whisper API + OpenAI TTS
- **Audio Processing**: Low-latency, silence-triggered, barge-in supported
- **Port**: 3001

## Data Flow

```
User Speech → MediaRecorder (40–100ms slices) → VAD/Endpointing → Socket.IO (ArrayBuffer) → Backend (per-socket buffer) → Whisper (STT) → LLM (gpt-4o-mini, system prompt) → TTS → Audio (base64) → Frontend playback → Continuous recording (supports barge‑in)
```

### Conversation Flow
1. **Recording Phase**: User speaks, MediaRecorder collects audio chunks
2. **Silence Detection**: After 2 seconds of silence, audio is processed
3. **Processing Phase**: Recording pauses, audio sent to backend
4. **AI Response**: Whisper → ChatGPT → TTS → Audio response
5. **Playback Phase**: AI response plays through speakers
6. **Resume Phase**: Recording automatically resumes for next message

## Key Technical Features

### Real-time Audio Streaming
- **Protocol**: Socket.IO WebSocket
- **Format**: WebM audio chunks
- **Buffer**: In-memory per socket
- **Processing**: Silence-triggered (2-second timeout)
- **Flow**: Pause during AI processing, resume after TTS completion

### AI Processing Pipeline
- **STT**: OpenAI Whisper API
- **LLM**: OpenAI gpt-4o-mini (system prompt adjustable via `SYSTEM_PROMPT`)
- **TTS**: OpenAI TTS (alloy voice)
- **Context**: Full conversation history
- **Interrupts**: Client emits `interrupt`; server versioning ignores stale responses

### State Management
- **Frontend**: React useState/useEffect
- **Backend**: In-memory Maps (socket-based)
- **Persistence**: None (stateless)

## Socket Events

### Frontend → Backend
- `audio-stream`: Real-time audio chunks (ArrayBuffer)
- `text-message`: Text input
- `start-recording`: Recording start
- `stop-recording`: Recording end
- `interrupt`: User began speaking while AI speaking; cancel/ignore in-flight response

### Backend → Frontend
- `message-received`: User message confirmation
- `ai-typing`: Typing indicator
- `ai-response`: AI response (includes base64 audio)
- `conversation-update`: Full chat history

## Error Handling
- **Audio Format**: WebM validation
- **API Limits**: Rate limiting and debouncing
- **Connection**: Socket reconnection logic
- **Processing**: Duplicate request prevention

## Performance Optimizations
- **Audio Chunking**: 100ms intervals for smooth voice detection
- **Silence Detection**: 2-second timeout for natural conversation flow
- **Buffer Management**: Automatic cleanup after processing
- **Memory**: Per-socket isolation
- **API Calls**: Debounced processing with custom wait logic
- **Recording Flow**: Pause during AI processing, resume after TTS completion

## Security
- **CORS**: Configured for localhost
- **Helmet**: Security headers
- **API Keys**: Environment variables
- **Validation**: Input sanitization

## Development Setup

### Prerequisites
- **Node.js**: 18+ (LTS recommended)
- **pnpm**: 8+ (`npm install -g pnpm`)
- **OpenAI API Key**: Required for AI functionality

### Quick Setup

1. **Clone and install**
   ```bash
   git clone <repository-url>
   cd voice-chat-ai
   pnpm install
   ```

2. **Configure environment**
   ```bash
   cd apps/api
   cp .env.example .env  # or create .env manually
   ```
   
   Add to `apps/api/.env`:
   ```env
   PORT=3001
   FRONTEND_URL=http://localhost:3000
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **Start development**
   ```bash
   pnpm dev  # Starts both frontend and backend
   ```

4. **Access applications**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001
   - Health check: http://localhost:3001/health

### Individual Package Development

```bash
# Frontend only
pnpm --filter @voice-chat-ai/web dev

# Backend only  
pnpm --filter @voice-chat-ai/api dev

# Build all packages
pnpm build

# Type checking
pnpm type-check

# Linting
pnpm lint
```

## Key Files Overview

### Frontend Core Files
- **`apps/web/src/app/page.tsx`**: Main chat interface with Socket.IO integration
- **`apps/web/src/app/layout.tsx`**: Root layout with Inter font and metadata
- **`apps/web/src/app/globals.css`**: Global styles and animations

### Backend Core Files  
- **`apps/api/src/index.ts`**: Express server with Socket.IO, Whisper API, and ChatGPT integration
- **`apps/api/.env`**: Environment variables (API keys, ports)

### Configuration Files
- **`package.json`**: Root workspace configuration and scripts
- **`pnpm-workspace.yaml`**: pnpm workspace definition
- **`tsconfig.json`**: Global TypeScript configuration

## Troubleshooting

### Common Issues

**Port conflicts**
```bash
# Check if ports are in use
lsof -i :3000  # Frontend port
lsof -i :3001  # Backend port
```

**Build errors**
```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

**Socket connection issues**
- Ensure both frontend and backend are running
- Check CORS configuration in backend
- Verify environment variables are set

**Audio recording issues**
- Check browser microphone permissions
- Ensure HTTPS in production (required for MediaRecorder)
- Verify WebM codec support
- Voice activity detection requires microphone access
- TTS playback requires speaker/headphone access

### Environment Variables

Backend `apps/api/.env`:
```env
PORT=3001
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
OPENAI_API_KEY=sk-...
SYSTEM_PROMPT=You are a helpful and friendly AI assistant. Keep responses concise and on-topic.
LOG_LEVEL=info
```

Frontend `apps/web/.env`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Development Tools
- **Package Manager**: pnpm workspaces
- **Build**: TypeScript compilation
- **Linting**: ESLint + Prettier
- **Hot Reload**: Development servers
