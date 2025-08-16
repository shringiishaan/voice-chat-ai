# AI Chat Assistant - Backend API

This is the Node.js backend server for the AI Chat Assistant application, providing real-time audio streaming, speech-to-text, and text-to-speech capabilities.

## Features

- 🎤 **Real-time Audio Streaming**: Socket.IO based audio streaming from frontend
- 🗣️ **Speech-to-Text**: OpenAI Whisper API (Whisper) integration
- 🔊 **Text-to-Speech**: OpenAI TTS (alloy) returns base64‑encoded audio
- 🤖 **AI Response Generation**: OpenAI gpt-4o-mini with adjustable system prompt
- 🧠 **Barge‑in / Interruptions**: Client can interrupt AI; server ignores stale responses
- 📡 **Socket.IO Communication**: Real-time bidirectional communication

## Setup

### Prerequisites

1. **OpenAI API Key**: You need an OpenAI API key for Whisper speech-to-text
2. **OpenAI Account**: Sign up at [OpenAI](https://platform.openai.com/) if you don't have one

### OpenAI Setup

1. **Get API Key**:
   - Go to [OpenAI Platform](https://platform.openai.com/api-keys)
   - Create a new API key
   - Copy the key (it starts with `sk-`)

2. **Set Environment Variable**:
   ```bash
   export OPENAI_API_KEY=your_openai_api_key_here
   ```

### Environment Configuration

Create a `.env` file in the `apps/api` directory:

```env
# Server Configuration
PORT=3001
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
SYSTEM_PROMPT=You are a helpful and friendly AI assistant. Keep responses concise and on-topic.
LOG_LEVEL=info
```

## Socket.IO Events

### Client to Server

- `audio-stream`: Stream audio chunks from frontend (ArrayBuffer payload)
- `text-message`: Send text messages
- `start-recording`: Start voice recording session
- `stop-recording`: Stop voice recording session
- `interrupt`: User started speaking during AI playback (invalidate current response)

### Server to Client

- `ai-response`: AI response with text and base64 audio
- `ai-typing`: Typing indicator start/stop
- `message-received`: Echo of accepted user message
- `speech-result`: Real-time speech recognition results (when applicable)
- `error`: Error messages

## Audio Processing Flow

1. **Frontend Recording**: User records via MediaRecorder (40–100ms chunks)
2. **Audio Streaming**: Chunks sent as ArrayBuffer via Socket.IO
3. **Buffer Management**: Backend keeps one chunk at a time (finalized on silence/manual stop)
4. **Speech Recognition**: Whisper transcribes the final chunk
5. **AI Response**: gpt-4o-mini generates a reply using `SYSTEM_PROMPT` + history
6. **Text-to-Speech**: OpenAI TTS produces MP3, returned as base64
7. **Audio Response**: Frontend plays audio; continuous recording supports barge‑in

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## API Endpoints

- `GET /health`: Health check endpoint
- `WebSocket /`: Socket.IO connection for real-time communication

## Future Enhancements

- [ ] OpenAI GPT integration for AI responses
- [ ] Text-to-Speech integration (ElevenLabs, Azure, etc.)
- [ ] Advanced audio processing
- [ ] Multi-language support
- [ ] Voice customization
- [ ] Conversation history
- [ ] User authentication
