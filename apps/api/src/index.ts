import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
// Custom wait implementation for better UX
// Types for audio streaming
interface AudioStreamData {
  audioChunk: ArrayBuffer | Buffer;
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

// Validate required environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY. Please set it in your environment.');
  process.exit(1);
}

const app = express();
const server = createServer(app);
const allowedOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '*';
const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST"],
    credentials: allowedOrigin !== '*'
  }
});

// Initialize OpenAI client for Whisper API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Audio buffer storage per socket
const audioBuffers = new Map<string, Buffer[]>();
const processingSockets = new Set<string>();
// Streaming STT helpers per socket
const sttDebounceTimers = new Map<string, NodeJS.Timeout>();
const sttInProgress = new Set<string>();

// Conversation history storage per socket
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const conversationHistory = new Map<string, ConversationMessage[]>();

// Per-socket language preferences
interface ConversationPreferences {
  targetLanguage: 'auto' | string; // BCP-47 code or 'auto'
  lastDetectedLanguage?: string;   // Updated from STT results
}

const conversationPreferences = new Map<string, ConversationPreferences>();
// Track last input source to tag user messages properly
type InputSource = 'voice' | 'text';
const lastInputSource = new Map<string, InputSource>();

// Abort controllers for canceling in-flight work per socket
interface InFlightControllers {
  llm?: AbortController;
  stt?: AbortController;
  tts?: AbortController;
}
const controllersBySocket = new Map<string, InFlightControllers>();

function abortInFlightControllers(socketId: string) {
  const c = controllersBySocket.get(socketId);
  if (!c) return;
  try { c.llm?.abort(); } catch {}
  try { c.stt?.abort(); } catch {}
  try { c.tts?.abort(); } catch {}
  controllersBySocket.set(socketId, {});
}

// Custom wait implementation for ChatGPT calls
interface ChatGPTCallState {
  isWaiting: boolean;
  lastCallTime: number;
  pendingInput: string | null;
}

const chatGPTCallStates = new Map<string, ChatGPTCallState>();
const conversationVersions = new Map<string, number>();

// Custom wait function for ChatGPT calls
// queueOnly: if true, only queue/update pending input and schedule after wait window
async function triggerChatGPTWithWait(
  userInput: string,
  socketId: string,
  socket: Socket,
  queueOnly: boolean = false
): Promise<void> {
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
  const waitTime = 400; // reduced wait for snappier updates

  if (queueOnly) {
    // Update pending input and schedule a deferred run if not already waiting
    state.pendingInput = trimmedInput;
    if (!state.isWaiting) {
      state.isWaiting = true;
      state.lastCallTime = now;
      setTimeout(() => {
        state.isWaiting = false;
        if (state.pendingInput) {
          const pendingInput = state.pendingInput;
          state.pendingInput = null;
          triggerChatGPTWithWait(pendingInput, socketId, socket);
        }
      }, waitTime);
    }
    return;
  }

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
app.use(cors({
  origin: allowedOrigin,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
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
  conversationVersions.set(socket.id, 0);
  conversationPreferences.set(socket.id, { targetLanguage: 'auto' });
  lastInputSource.set(socket.id, 'text');
  
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
      const chunkSize = (data.audioChunk as any)?.byteLength ?? (data.audioChunk as any)?.length ?? 0;
      console.log(`   📊 Chunk size: ${chunkSize} bytes`);
      console.log(`   🏁 Is final: ${data.isFinal}`);
      console.log(`   ⏰ Timestamp: ${data.timestamp}`);

      // Add to buffer (append for streaming)
      const buffer = audioBuffers.get(socket.id);
      if (buffer) {
        buffer.push(Buffer.from(data.audioChunk as ArrayBuffer));
        // Trim buffer if it grows too large (keep last ~1.5MB)
        const maxBytes = 1_500_000;
        let total = buffer.reduce((acc, b) => acc + b.length, 0);
        while (total > maxBytes && buffer.length > 1) {
          const removed = buffer.shift();
          total -= removed ? removed.length : 0;
        }
        console.log(`   📦 Buffer updated: ${buffer.length} chunks, ~${total} bytes`);
      }

      // If this is the final chunk, process immediately
      if (data.isFinal) {
        console.log(`\n🎯 [${new Date().toISOString()}] Final chunk received, processing immediately...`);
        await processCompleteAudio(socket);
      } else {
        // Schedule partial transcription for streaming STT
        schedulePartialTranscription(socket);
      }
    } catch (error) {
      console.error('❌ Error processing audio stream:', error);
      socket.emit('error', { message: 'Failed to process audio stream' });
    }
  });

  // Handle user interrupt (barge-in)
  socket.on('interrupt', () => {
    console.log(`⛔ Interrupt received from ${socket.id} - invalidating in-flight responses`);
    // Increment conversation version to invalidate in-flight responses
    conversationVersions.set(socket.id, (conversationVersions.get(socket.id) || 0) + 1);
    // Abort in-flight external calls
    abortInFlightControllers(socket.id);
    // Stop typing indicator
    socket.emit('ai-typing', { isTyping: false, timestamp: new Date().toISOString() });
  });

  // Handle text messages
  socket.on('text-message', async (data) => {
    try {
      console.log(`\n💬 [${new Date().toISOString()}] Text message received from ${socket.id}`);
      console.log(`   📝 Message: "${data.text}"`);
      console.log(`   ⏰ Timestamp: ${data.timestamp}`);

      // Trigger ChatGPT processing with custom wait for text message
      console.log(`   🧠 Triggering ChatGPT processing with wait for text message...`);
      lastInputSource.set(socket.id, 'text');
      await triggerChatGPTWithWait(data.text, socket.id, socket);
    } catch (error) {
      console.error(`\n❌ [${new Date().toISOString()}] Error processing text message:`);
      console.error(`   Error details:`, error);
      console.error(`   Socket ID: ${socket.id}`);
      socket.emit('error', { message: 'Failed to process text message' });
    }
  });

  // Handle language preference updates
  socket.on('set-language', (data: { language: string }) => {
    try {
      const lang = (data?.language || 'auto').trim();
      const prefs = conversationPreferences.get(socket.id) || { targetLanguage: 'auto' };
      prefs.targetLanguage = lang === '' ? 'auto' : (lang as any);
      conversationPreferences.set(socket.id, prefs);
      console.log(`🌐 Language preference updated for ${socket.id}:`, prefs.targetLanguage);
      socket.emit('language-updated', { language: prefs.targetLanguage, timestamp: new Date().toISOString() });
    } catch (e) {
      console.error('❌ Error updating language preference:', e);
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

  // Handle voice recording stop (no-op for processing to avoid duplicate triggers)
  socket.on('stop-recording', async () => {
    console.log(`\n⏹️ [${new Date().toISOString()}] Recording stopped for ${socket.id}`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('👋 User disconnected:', socket.id);
    
    // Clean up resources
    audioBuffers.delete(socket.id);
    conversationHistory.delete(socket.id);
    chatGPTCallStates.delete(socket.id);
    conversationVersions.delete(socket.id);
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
    if (processingSockets.has(socket.id)) {
      console.log(`   ⚠️ Audio processing already in progress for: ${socket.id}`);
      return;
    }
    processingSockets.add(socket.id);

    // Concatenate buffered chunks into single buffer
    const completeAudio = Buffer.concat(buffer);
    console.log(`   📊 Audio ready for processing:`);
    console.log(`      - Total size: ${completeAudio.length} bytes`);

    // Skip processing if audio is empty
    if (completeAudio.length === 0) {
      console.log(`   ⚠️ Empty audio buffer detected, skipping Whisper API call`);
      return;
    }

    // Clear the buffer
    audioBuffers.set(socket.id, []);
    console.log(`   🧹 Buffer cleared for ${socket.id}`);

    // Process audio with Whisper API (auto language or preferred language)
    try {
      console.log(`\n🎤 [${new Date().toISOString()}] Initiating Whisper API call...`);
      console.log(`   📁 Preparing audio for Whisper API`);
      console.log(`   📏 Audio buffer size: ${completeAudio.length} bytes`);
      
      // Use OpenAI SDK helper to create a File from Buffer in Node
      const audioFile = await toFile(completeAudio, 'audio.webm', { type: 'audio/webm' });
      console.log(`   ✅ Audio file prepared successfully`);
      
      console.log(`   🚀 Calling OpenAI Whisper API...`);
      const startTime = Date.now();
      
      // Determine language preference and mark input source
      lastInputSource.set(socket.id, 'voice');
      const prefs = conversationPreferences.get(socket.id) || { targetLanguage: 'auto' };

      // Call Whisper API with verbose_json to capture detected language
      const sttController = new AbortController();
      const existing = controllersBySocket.get(socket.id) || {};
      existing.stt = sttController;
      controllersBySocket.set(socket.id, existing);
      const transcription: any = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        ...(prefs.targetLanguage !== 'auto' ? { language: prefs.targetLanguage } : {}),
        response_format: "verbose_json",
        signal: sttController.signal as any
      });

      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      console.log(`\n📝 [${new Date().toISOString()}] Whisper API response received!`);
      console.log(`   ⏱️ Processing time: ${processingTime}ms`);
      console.log(`   📊 Audio size processed: ${completeAudio.length} bytes`);
      console.log(`   🎯 Transcription result:`);
      console.log(`      "${transcription?.text || ''}"`);
      console.log(`   🌐 Detected language: ${transcription?.language || 'unknown'}`);
      console.log(`   📏 Transcription length: ${(transcription?.text || '').length} characters`);

      // Update detected language if auto
      if (transcription?.language) {
        const current = conversationPreferences.get(socket.id) || { targetLanguage: 'auto' };
        current.lastDetectedLanguage = transcription.language;
        conversationPreferences.set(socket.id, current);
      }

      // Trigger ChatGPT processing with custom wait
      console.log(`\n🧠 [${new Date().toISOString()}] Triggering ChatGPT processing with wait...`);
      await triggerChatGPTWithWait(transcription?.text || '', socket.id, socket);
      
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
    processingSockets.delete(socket.id);
  }
}

// Streaming STT: schedule partial transcription on buffered audio
function schedulePartialTranscription(socket: Socket) {
  const existing = sttDebounceTimers.get(socket.id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    try {
      if (sttInProgress.has(socket.id)) return; // avoid overlapping STT
      const buffer = audioBuffers.get(socket.id);
      if (!buffer || buffer.length === 0) return;
      const combined = Buffer.concat(buffer);
      if (combined.length < 9000) return; // lower threshold for quicker partials
      sttInProgress.add(socket.id);
      console.log(`\n🗣️ [${new Date().toISOString()}] Partial STT on ~${combined.length} bytes`);

      const audioFile = await toFile(combined, 'partial.webm', { type: 'audio/webm' });

      const prefs = conversationPreferences.get(socket.id) || { targetLanguage: 'auto' };
      const sttController = new AbortController();
      const existing = controllersBySocket.get(socket.id) || {};
      existing.stt = sttController;
      controllersBySocket.set(socket.id, existing);
      const transcription: any = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        ...(prefs.targetLanguage !== 'auto' ? { language: prefs.targetLanguage } : {}),
        response_format: 'verbose_json',
        signal: sttController.signal as any
      });

      socket.emit('speech-result', {
        text: transcription?.text || '',
        confidence: typeof transcription?.confidence === 'number' ? transcription.confidence : 0,
        isFinal: false,
        timestamp: new Date()
      });

      // Update detected language
      if (transcription?.language) {
        const current = conversationPreferences.get(socket.id) || { targetLanguage: 'auto' };
        current.lastDetectedLanguage = transcription.language;
        conversationPreferences.set(socket.id, current);
      }

      // Queue early LLM start on stable partial without duplicating messages
      const partialText = (transcription?.text || '').trim();
      if (partialText && partialText.length >= 8) {
        lastInputSource.set(socket.id, 'voice');
        await triggerChatGPTWithWait(partialText, socket.id, socket, true);
      }
    } catch (e) {
      console.error('❌ Partial STT error:', e);
    } finally {
      sttInProgress.delete(socket.id);
    }
  }, 350); // reduced debounce for faster partials
  sttDebounceTimers.set(socket.id, timer);
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

// Utility to keep conversation history bounded
function pruneHistory(history: ConversationMessage[], maxMessages: number = 20): ConversationMessage[] {
  if (history.length <= maxMessages) return history;
  return history.slice(history.length - maxMessages);
}

// Process user input with ChatGPT (streams tokens to client)
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
      isVoice: (lastInputSource.get(socketId) || 'text') === 'voice'
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
    const systemPrompt = process.env.SYSTEM_PROMPT || 
      "You are a helpful and friendly AI assistant. Keep responses concise and on-topic.";

    const prefs = conversationPreferences.get(socketId) || { targetLanguage: 'auto' };
    const targetLanguage = prefs.targetLanguage === 'auto' ? (prefs.lastDetectedLanguage || 'auto') : prefs.targetLanguage;

    const languageDirective = targetLanguage === 'auto'
      ? 'Respond in the same language as the user input.'
      : `Respond in ${targetLanguage}.`;

    const messages = [
      { role: 'system' as const, content: `${systemPrompt}\n\n${languageDirective}` },
      ...history.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }))
    ];
    
    console.log(`   🚀 Calling ChatGPT API (stream) with ${messages.length} messages...`);
    const startTime = Date.now();
    let firstTokenMs: number | null = null;
    
    // Call ChatGPT API
    const versionAtStart = conversationVersions.get(socketId) || 0;
    const llmController = new AbortController();
    const existing = controllersBySocket.get(socketId) || {};
    existing.llm = llmController;
    controllersBySocket.set(socketId, existing);
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      max_tokens: 240,
      temperature: 0.7,
      stream: true,
      signal: llmController.signal as any
    });

    // Start streaming events to client
    const aiMessageId = Date.now().toString();
    socket.emit('ai-message-start', {
      id: aiMessageId,
      timestamp: new Date().toISOString()
    });

    let aiResponse = '';
    for await (const part of stream as any) {
      // Interrupt check inside loop
      if ((conversationVersions.get(socketId) || 0) !== versionAtStart) {
        console.log('⚠️ Stream aborted due to user interruption/newer version');
        socket.emit('ai-typing', { isTyping: false, timestamp: new Date().toISOString() });
        return;
      }
      const token = part?.choices?.[0]?.delta?.content || '';
      if (token) {
        if (firstTokenMs === null) {
          firstTokenMs = Date.now() - startTime;
          console.log(`   ⏱️ Time to first LLM token: ${firstTokenMs}ms`);
        }
        aiResponse += token;
        socket.emit('ai-token', { id: aiMessageId, token, timestamp: new Date().toISOString() });
      }
    }

    const endTime = Date.now();
    const processingTime = endTime - startTime;
    console.log(`\n🤖 [${new Date().toISOString()}] ChatGPT stream complete!`);
    console.log(`   ⏱️ Processing time: ${processingTime}ms`);
    console.log(`   🎯 AI response (final): "${aiResponse}"`);

    // Add AI response to history
    history.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    });
    
    // Prune and update conversation history
    const pruned = pruneHistory(history);
    conversationHistory.set(socketId, pruned);
    
    // Stop "AI is typing..." indicator and close streaming message
    console.log(`   🛑 Stopping "AI is typing..." indicator...`);
    socket.emit('ai-typing', {
      isTyping: false,
      timestamp: new Date().toISOString()
    });

    socket.emit('ai-message-done', {
      id: aiMessageId,
      text: aiResponse,
      timestamp: new Date().toISOString()
    });

    // Streaming TTS for AI response
    console.log(`   🔊 Streaming speech for AI response...`);
    await streamTextToSpeech(aiResponse, socket, aiMessageId, socketId);
    
    // Backward-compatibility final event (without audioBuffer now)
    const aiMessageCompat = {
      id: aiMessageId,
      text: aiResponse,
      sender: 'ai' as const,
      timestamp: new Date(),
      isVoice: false
    };
    socket.emit('ai-response', {
      message: aiMessageCompat,
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

// Streaming TTS: naive sentence chunking then sequential synth and emit
async function streamTextToSpeech(text: string, socket: Socket, messageId: string, socketId: string): Promise<void> {
  try {
    const sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
    const ttsStart = Date.now();
    let firstAudioMsLogged = false;
    for (const sentence of sentences) {
      if (!sentence.trim()) continue;
      // Abort/interrupt check before each chunk
      const currentVersion = conversationVersions.get(socketId) || 0;
      // If a newer version exists, stop streaming
      if ((conversationVersions.get(socketId) || 0) !== currentVersion) {
        break;
      }
      const buffer = await convertTextToSpeech(sentence.trim());
      if (!firstAudioMsLogged && buffer && buffer.length > 0) {
        const firstAudioMs = Date.now() - ttsStart;
        firstAudioMsLogged = true;
        console.log(`   ⏱️ Time to first TTS audio chunk: ${firstAudioMs}ms`);
      }
      socket.emit('ai-audio-chunk', {
        id: messageId,
        audioBuffer: buffer,
        timestamp: new Date().toISOString()
      });
    }
    socket.emit('ai-audio-done', { id: messageId, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Streaming TTS error:', error);
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
