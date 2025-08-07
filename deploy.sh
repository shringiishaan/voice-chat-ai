#!/bin/bash

set -e

LOCAL_BUILD_DIR="apps/api/dist"
SERVER_USER="ubuntu"
SERVER_HOST="fassix"
SERVER_BASE_DIR="/home/ubuntu"
SERVER_DIR="${SERVER_USER}@${SERVER_HOST}:${SERVER_BASE_DIR}/voice-chat-ai"

cd apps/api
pnpm run build
cd ../..

scp apps/api/package.json "${SERVER_DIR}/"
scp apps/api/prod.env "${SERVER_DIR}/.env"
scp -r "${LOCAL_BUILD_DIR}/"* "${SERVER_DIR}/"
