#!/bin/bash

set -e

LOCAL_BUILD_DIR="out"
SERVER_USER="ubuntu"
SERVER_HOST="fassix"
SERVER_DIR="${SERVER_USER}@${SERVER_HOST}:/var/www/voice.chat/html"

scp -r "${LOCAL_BUILD_DIR}/"* "${SERVER_DIR}/"
