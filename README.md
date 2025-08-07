# AI Chat Assistant

A real-time voice and text chat application with AI-powered conversations, featuring an iPhone-style interface and seamless voice-to-text capabilities.

## Features

- 🎤 **Real-time Voice Chat**: Speak naturally and get instant AI responses
- 💬 **Text Chat**: Type messages for traditional chat experience
- 🤖 **AI-Powered**: Powered by OpenAI GPT-3.5-turbo for intelligent conversations
- 🎯 **Speech Recognition**: Advanced Whisper API for accurate voice transcription
- 📱 **iPhone-Style UI**: Clean, modern interface with professional design
- ⚡ **Real-time Updates**: Live conversation flow with typing indicators
- 🔄 **Conversation History**: Maintains context throughout the chat session

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm package manager
- OpenAI API key

### Quick Setup

1. **Clone and install**
   ```bash
   git clone <repository-url>
   cd voice-chat-ai
   pnpm install
   ```

2. **Configure API key**
   ```bash
   cd apps/api
   echo "OPENAI_API_KEY=your_openai_api_key_here" > .env
   ```

3. **Start the app**
   ```bash
   pnpm dev
   ```

4. **Open in browser**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001

## How It Works

### Voice Chat
1. **Click microphone** → Start recording
2. **Speak naturally** → Voice activity detection shows when you're speaking
3. **Wait for silence** → After 2 seconds of silence, audio is automatically processed
4. **AI processes** → Your voice is converted to text using Whisper API
5. **AI responds** → ChatGPT generates contextual responses with text-to-speech
6. **Listen to response** → AI speaks back to you through your speakers
7. **Ready for next message** → Recording automatically resumes for your next input

### Text Chat
1. Type your message → Press Enter → Get AI response
2. Full conversation context is maintained
3. Real-time updates with smooth animations

## Design

- **iPhone-style interface** with professional blue accents
- **Real-time typing indicators** and smooth animations
- **Responsive design** that works on all devices
- **Clean, modern UI** with intuitive navigation

## Current Features

✅ **Voice & Text Chat** - Real-time conversations with AI
✅ **Speech Recognition** - Accurate voice-to-text conversion using Whisper API
✅ **Text-to-Speech** - AI responses spoken back to you using OpenAI TTS
✅ **Automatic Silence Detection** - Processes audio after 2 seconds of silence
✅ **Conversation History** - Maintains context throughout chat
✅ **Real-time Updates** - Live message streaming with typing indicators
✅ **Error Handling** - Robust error recovery and fallbacks
✅ **Mobile Responsive** - Works on all screen sizes
✅ **Natural Conversation Flow** - Pause during AI processing, resume for next message

## Planned Features

🔐 **User Accounts** - Secure authentication
💾 **Chat History** - Persistent conversations
🎛️ **Voice Settings** - Audio quality controls
🌐 **Multi-language** - Multiple language support

## Development

- `pnpm dev` - Start development servers
- `pnpm build` - Build for production
- `pnpm start` - Start production servers

## Technical Information

For detailed technical information including:
- System architecture and data flow
- Development setup and configuration
- API integrations and Socket.IO events
- Project structure and key files
- Troubleshooting and common issues

**Refer to [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md)**
