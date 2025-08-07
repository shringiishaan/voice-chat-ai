# AI Chat Assistant - Backend API

This is the Node.js backend server for the AI Chat Assistant application, providing real-time audio streaming, speech-to-text, and text-to-speech capabilities.

## Features

- 🎤 **Real-time Audio Streaming**: Socket.IO based audio streaming from frontend
- 🗣️ **Speech-to-Text**: OpenAI Whisper API integration
- 🔊 **Text-to-Speech**: Mock implementation (ready for TTS integration)
- 🤖 **AI Response Generation**: Placeholder for AI model integration
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

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
```

## Socket.IO Events

### Client to Server

- `audio-stream`: Stream audio chunks from frontend
- `text-message`: Send text messages
- `start-recording`: Start voice recording session
- `stop-recording`: Stop voice recording session

### Server to Client

- `ai-response`: AI response with text and audio
- `speech-result`: Real-time speech recognition results
- `error`: Error messages

## Audio Processing Flow

1. **Frontend Recording**: User starts recording with MediaRecorder API
2. **Audio Streaming**: Audio chunks sent via Socket.IO to backend
3. **Buffer Management**: Backend accumulates audio chunks in buffer
4. **Speech Recognition**: OpenAI Whisper API processes complete audio
5. **AI Response**: Generated response (placeholder for now)
6. **Text-to-Speech**: Mock audio response (ready for TTS integration)
7. **Audio Response**: Audio sent back to frontend for playback

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
