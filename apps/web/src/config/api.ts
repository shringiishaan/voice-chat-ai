// API Configuration
const getApiUrl = () => {
  // Check if we're in production by looking at the hostname
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'fassix.com' || hostname === 'www.fassix.com') {
      return 'https://fassix.com:12004';
    }
  }
  
  // Fallback to environment variable or localhost
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
};

export const API_CONFIG = {
  SOCKET_URL: getApiUrl(),
  
  // Environment detection
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
};

// Log the current API configuration (only in development)
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 API Configuration:', API_CONFIG);
}
