import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import OpenAI from 'openai';
// Custom wait implementation for better UX
// Types for audio streaming
interface AudioStreamData {
  audioChunk: Buffer;
  isFinal: boolean;
  timestamp: Date;
}

interface SpeechRecognitionResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: Date;
}

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Initialize OpenAI client for Whisper API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Audio buffer storage per socket
const audioBuffers = new Map<string, Buffer[]>();

// Conversation history storage per socket
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const conversationHistory = new Map<string, ConversationMessage[]>();

// Custom wait implementation for ChatGPT calls
interface ChatGPTCallState {
  isWaiting: boolean;
  lastCallTime: number;
  pendingInput: string | null;
}

const chatGPTCallStates = new Map<string, ChatGPTCallState>();

// Custom wait function for ChatGPT calls
async function triggerChatGPTWithWait(userInput: string, socketId: string, socket: Socket): Promise<void> {
  // Check for empty or whitespace-only messages
  const trimmedInput = userInput.trim();
  if (!trimmedInput) {
    console.log(`   🚫 Empty message detected, skipping ChatGPT processing`);
    // Send processing complete signal to frontend to reset state
    socket.emit('processing-complete', { 
      message: 'Empty message detected, no processing needed',
      timestamp: new Date().toISOString()
    });
    return;
  }

  const state = chatGPTCallStates.get(socketId);
  if (!state) return;

  const now = Date.now();
  const waitTime = 1000; // 1 second wait

  if (!state.isWaiting) {
    // First call - execute immediately
    console.log(`   🚀 First ChatGPT call - executing immediately`);
    state.isWaiting = true;
    state.lastCallTime = now;
    await processWithChatGPT(trimmedInput, socketId, socket);
    
    // Set up wait period
    setTimeout(() => {
      state.isWaiting = false;
      if (state.pendingInput) {
        console.log(`   🔄 Processing pending input after wait: "${state.pendingInput}"`);
        const pendingInput = state.pendingInput;
        state.pendingInput = null;
        triggerChatGPTWithWait(pendingInput, socketId, socket);
      }
    }, waitTime);
  } else {
    // Subsequent call - queue it
    console.log(`   ⏳ ChatGPT call in progress, queuing input: "${trimmedInput}"`);
    state.pendingInput = trimmedInput;
  }
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeConnections: io.engine.clientsCount
  });
});

// Socket.IO connection handling
io.on('connection', (socket: Socket) => {
  console.log('🎧 User connected:', socket.id);
  
  // Initialize audio buffer and conversation history for this socket
  audioBuffers.set(socket.id, []);
  conversationHistory.set(socket.id, []);
  
  // Initialize ChatGPT call state for this socket
  chatGPTCallStates.set(socket.id, {
    isWaiting: false,
    lastCallTime: 0,
    pendingInput: null
  });
  
  // Handle audio stream from frontend
  socket.on('audio-stream', async (data: AudioStreamData) => {
    try {
      console.log(`\n🎤 [${new Date().toISOString()}] Audio chunk received from ${socket.id}`);
      console.log(`   📊 Chunk size: ${data.audioChunk.length} bytes`);
      console.log(`   🏁 Is final: ${data.isFinal}`);
      console.log(`   ⏰ Timestamp: ${data.timestamp}`);

      // Add to buffer (will only have one chunk at a time now)
      const buffer = audioBuffers.get(socket.id);
      if (buffer) {
        // Clear buffer first since we're processing one chunk at a time
        buffer.length = 0;
        buffer.push(Buffer.from(data.audioChunk));
        console.log(`   📦 Buffer updated: 1 chunk, ${data.audioChunk.length} bytes`);
      }

      // If this is the final chunk, process immediately
      if (data.isFinal) {
        console.log(`\n🎯 [${new Date().toISOString()}] Final chunk received, processing immediately...`);
        await processCompleteAudio(socket);
      }
    } catch (error) {
      console.error('❌ Error processing audio stream:', error);
      socket.emit('error', { message: 'Failed to process audio stream' });
    }
  });

  // Handle text messages
  socket.on('text-message', async (data) => {
    try {
      console.log(`\n💬 [${new Date().toISOString()}] Text message received from ${socket.id}`);
      console.log(`   📝 Message: "${data.text}"`);
      console.log(`   ⏰ Timestamp: ${data.timestamp}`);

      // Trigger ChatGPT processing with custom wait for text message
      console.log(`   🧠 Triggering ChatGPT processing with wait for text message...`);
      await triggerChatGPTWithWait(data.text, socket.id, socket);
    } catch (error) {
      console.error(`\n❌ [${new Date().toISOString()}] Error processing text message:`);
      console.error(`   Error details:`, error);
      console.error(`   Socket ID: ${socket.id}`);
      socket.emit('error', { message: 'Failed to process text message' });
    }
  });

  // Handle voice recording start
  socket.on('start-recording', () => {
    console.log(`\n🎙️ [${new Date().toISOString()}] Recording started for ${socket.id}`);
    console.log(`   🧹 Clearing previous audio buffer`);
    
    // Clear previous buffer
    audioBuffers.set(socket.id, []);
    
    console.log(`   ✅ Audio buffer initialized for ${socket.id}`);
    console.log(`   🎯 Whisper API ready for speech recognition`);
  });

  // Handle voice recording stop
  socket.on('stop-recording', async () => {
    console.log(`\n⏹️ [${new Date().toISOString()}] Recording stopped for ${socket.id}`);
    console.log(`   🔄 Initiating audio processing pipeline...`);
    
    // Process the complete audio buffer
    await processCompleteAudio(socket);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('👋 User disconnected:', socket.id);
    
    // Clean up resources
    audioBuffers.delete(socket.id);
    conversationHistory.delete(socket.id);
    chatGPTCallStates.delete(socket.id);
  });
});

// Process complete audio buffer
async function processCompleteAudio(socket: Socket) {
  try {
    console.log(`\n🎵 [${new Date().toISOString()}] Starting complete audio processing for ${socket.id}`);
    
    const buffer = audioBuffers.get(socket.id);
    if (!buffer || buffer.length === 0) {
      console.log(`   ⚠️ No audio buffer found for: ${socket.id}`);
      return;
    }

    // Check if we're already processing audio for this socket
    const processingKey = `processing_${socket.id}`;
    if ((global as any)[processingKey]) {
      console.log(`   ⚠️ Audio processing already in progress for: ${socket.id}`);
      return;
    }
    
    // Mark as processing
    (global as any)[processingKey] = true;

    // Get the single audio chunk (buffer now only contains one chunk)
    const completeAudio = buffer[0];
    console.log(`   📊 Audio chunk ready for processing:`);
    console.log(`      - Chunk size: ${completeAudio.length} bytes`);

    // Skip processing if audio is empty
    if (completeAudio.length === 0) {
      console.log(`   ⚠️ Empty audio buffer detected, skipping Whisper API call`);
      return;
    }

    // Clear the buffer
    audioBuffers.set(socket.id, []);
    console.log(`   🧹 Buffer cleared for ${socket.id}`);

    // Process audio with Whisper API
    try {
      console.log(`\n🎤 [${new Date().toISOString()}] Initiating Whisper API call...`);
      console.log(`   📁 Creating audio file for Whisper API`);
      console.log(`   📏 Audio file size: ${completeAudio.length} bytes`);
      
      // Create a Blob first, then convert to File for better compatibility
      const audioBlob = new Blob([completeAudio], { type: 'audio/webm' });
      const audioFile = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
      console.log(`   ✅ Audio file created successfully`);
      console.log(`   📊 File details: ${audioFile.name}, ${audioFile.size} bytes, ${audioFile.type}`);
      
      console.log(`   🚀 Calling OpenAI Whisper API...`);
      const startTime = Date.now();
      
      // Call Whisper API
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "en",
        response_format: "text"
      });

      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      console.log(`\n📝 [${new Date().toISOString()}] Whisper API response received!`);
      console.log(`   ⏱️ Processing time: ${processingTime}ms`);
      console.log(`   📊 Audio size processed: ${completeAudio.length} bytes`);
      console.log(`   🎯 Transcription result:`);
      console.log(`      "${transcription}"`);
      console.log(`   📏 Transcription length: ${transcription.length} characters`);

      // Trigger ChatGPT processing with custom wait
      console.log(`\n🧠 [${new Date().toISOString()}] Triggering ChatGPT processing with wait...`);
      await triggerChatGPTWithWait(transcription, socket.id, socket);
      
    } catch (error) {
      console.error(`\n❌ [${new Date().toISOString()}] Whisper API error:`);
      console.error(`   Error details:`, error);
      console.error(`   Socket ID: ${socket.id}`);
      console.error(`   Audio size: ${completeAudio.length} bytes`);
      socket.emit('error', { message: 'Failed to transcribe audio' });
    }
  } catch (error) {
    console.error(`\n❌ [${new Date().toISOString()}] Error processing complete audio:`);
    console.error(`   Error details:`, error);
    console.error(`   Socket ID: ${socket.id}`);
    socket.emit('error', { message: 'Failed to process audio' });
  } finally {
    // Clear processing flag
    const processingKey = `processing_${socket.id}`;
    delete (global as any)[processingKey];
  }
}

// Generate AI response (placeholder for now)
async function generateAIResponse(userInput: string): Promise<string> {
  console.log(`   📝 Processing user input: "${userInput}"`);
  
  // Simulate processing time
  console.log(`   ⏳ Simulating AI processing time...`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const response = `I heard you say: "${userInput}". This is a demo response. In a real implementation, this would be processed by an AI model like GPT or Claude.`;
  console.log(`   ✅ AI response generated successfully`);
  
  return response;
}

// Process user input with ChatGPT
async function processWithChatGPT(userInput: string, socketId: string, socket: Socket): Promise<void> {
  try {
    console.log(`\n🧠 [${new Date().toISOString()}] Processing ChatGPT request:`);
    console.log(`   👤 User input: "${userInput}"`);
    console.log(`   🔗 Socket ID: ${socketId}`);
    
    const history = conversationHistory.get(socketId) || [];
    console.log(`   📚 Conversation history: ${history.length} messages`);
    
    // Add user message to history
    history.push({
      role: 'user',
      content: userInput,
      timestamp: new Date()
    });
    
    // Update conversation history immediately
    conversationHistory.set(socketId, history);
    
    // Send user message to frontend immediately
    const userMessage = {
      id: history[history.length - 1].timestamp.getTime().toString(),
      text: userInput,
      sender: 'user' as const,
      timestamp: history[history.length - 1].timestamp,
      isVoice: true
    };
    
    console.log(`   📤 Sending user message to frontend immediately...`);
    socket.emit('message-received', {
      message: userMessage,
      timestamp: new Date().toISOString()
    });
    
    // Send "AI is typing..." indicator
    console.log(`   🤖 Sending "AI is typing..." indicator...`);
    socket.emit('ai-typing', {
      isTyping: true,
      timestamp: new Date().toISOString()
    });
    
    // Prepare messages for ChatGPT
    const messages = [
      {
        role: 'system' as const,
        content: `You are Zarvis, a funny AI friend with Chandler Bing's personality. Be sarcastic, witty, and make jokes. Use phrases like "Could I BE any more...", "Oh my God!", "Well, well, well...". Keep responses to 1-2 lines maximum and always include humor. Make self-deprecating AI jokes.`
      },
      ...history.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }))
    ];
    
    console.log(`   🚀 Calling ChatGPT API with ${messages.length} messages...`);
    const startTime = Date.now();
    
    // Call ChatGPT API
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      max_tokens: 50, // Reduced for shorter 1-2 line responses
      temperature: 0.9, // Higher temperature for more creative and funny responses
    });
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    
    console.log(`\n🤖 [${new Date().toISOString()}] ChatGPT response received!`);
    console.log(`   ⏱️ Processing time: ${processingTime}ms`);
    console.log(`   🎯 AI response: "${aiResponse}"`);
    
    // Add AI response to history
    history.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    });
    
    // Update conversation history
    conversationHistory.set(socketId, history);
    
    // Stop "AI is typing..." indicator
    console.log(`   🛑 Stopping "AI is typing..." indicator...`);
    socket.emit('ai-typing', {
      isTyping: false,
      timestamp: new Date().toISOString()
    });
    
    // Generate speech for AI response
    console.log(`   🔊 Generating speech for AI response...`);
    const audioBuffer = await convertTextToSpeech(aiResponse);
    
    // Send AI response to frontend with audio
    const aiMessage = {
      id: history[history.length - 1].timestamp.getTime().toString(),
      text: aiResponse,
      sender: 'ai' as const,
      timestamp: history[history.length - 1].timestamp,
      isVoice: false
    };
    
    console.log(`   📤 Sending AI response with audio to frontend...`);
    socket.emit('ai-response', {
      message: aiMessage,
      audioBuffer: audioBuffer.toString('base64'), // Convert to base64 for transmission
      timestamp: new Date().toISOString()
    });
    
    console.log(`\n✅ [${new Date().toISOString()}] ChatGPT processing complete:`);
    console.log(`   👤 User: "${userInput}"`);
    console.log(`   🤖 AI: "${aiResponse}"`);
    console.log(`   📊 Total conversation messages: ${history.length}`);
    
  } catch (error) {
    console.error(`\n❌ [${new Date().toISOString()}] ChatGPT API error:`);
    console.error(`   Error details:`, error);
    console.error(`   Socket ID: ${socketId}`);
    console.error(`   User input: "${userInput}"`);
    
    // Stop "AI is typing..." indicator on error
    socket.emit('ai-typing', {
      isTyping: false,
      timestamp: new Date().toISOString()
    });
    
    // Send error to client
    socket.emit('error', { message: 'Failed to get AI response' });
  }
}

// OpenAI Text-to-Speech function
async function convertTextToSpeech(text: string): Promise<Buffer> {
  try {
    console.log('🔊 [OpenAI TTS] Processing text:', text);
    
    const startTime = Date.now();
    
    // Call OpenAI TTS API
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy", // Options: alloy, echo, fable, onyx, nova, shimmer
      input: text,
    });
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    // Convert response to buffer
    const buffer = Buffer.from(await mp3.arrayBuffer());
    
    console.log(`✅ [OpenAI TTS] Audio generated successfully:`);
    console.log(`   ⏱️ Processing time: ${processingTime}ms`);
    console.log(`   📊 Audio size: ${buffer.length} bytes`);
    console.log(`   🎯 Text length: ${text.length} characters`);
    
    return buffer;
  } catch (error) {
    console.error('❌ [OpenAI TTS] Error generating speech:', error);
    // Return empty buffer on error
    return Buffer.alloc(0);
  }
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready for connections`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🎤 Audio streaming enabled with Whisper API`);
  console.log(`🧠 AI response generation ready`);
});
