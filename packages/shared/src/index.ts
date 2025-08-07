// Message types
export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  isVoice?: boolean;
  audioUrl?: string;
}

// Socket.IO event types
export interface VoiceMessageData {
  audioBlob: Blob;
  duration: number;
  timestamp: Date;
}

export interface AudioStreamData {
  audioChunk: Buffer;
  isFinal: boolean;
  timestamp: Date;
}

export interface TextMessageData {
  text: string;
  timestamp: Date;
}

export interface AIResponseData {
  text: string;
  audioUrl?: string;
  timestamp: Date;
}

export interface SpeechRecognitionResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: Date;
}

// Connection status
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// Voice recording states
export type RecordingState = 'idle' | 'recording' | 'processing' | 'error';

// Utility functions
export function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
