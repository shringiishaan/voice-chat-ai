// API Configuration
export const API_CONFIG = {
  // Development: localhost:3001
  // Production: https://fassix.com:12004
  SOCKET_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  
  // Environment detection
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
};

// Log the current API configuration (only in development)
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 API Configuration:', API_CONFIG);
}
