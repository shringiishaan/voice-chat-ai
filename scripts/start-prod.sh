#!/bin/bash

# Voice Chat AI Production Startup Script
echo "🚀 Starting Voice Chat AI in Production Mode..."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install pnpm first."
    exit 1
fi

# Build all packages
echo "🔨 Building all packages..."
pnpm build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please check the errors above."
    exit 1
fi

echo "✅ Build completed successfully!"

# Start production servers
echo "🔥 Starting production servers..."
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend: http://localhost:3001"
echo "📡 Socket.IO: ws://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Start both servers in parallel
pnpm --recursive run start
