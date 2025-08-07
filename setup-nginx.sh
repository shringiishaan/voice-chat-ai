#!/bin/bash

set -e

SERVER_USER="ubuntu"
SERVER_HOST="fassix"
CONFIG_FILE="fassix.com.nginx.conf"
SERVER_CONFIG="/etc/nginx/sites-available/fassix.com"

scp "${CONFIG_FILE}" "${SERVER_USER}@${SERVER_HOST}:/tmp/fassix.com.nginx.conf"

ssh ${SERVER_USER}@${SERVER_HOST} "sudo cp /tmp/fassix.com.nginx.conf ${SERVER_CONFIG} && sudo nginx -t && sudo systemctl reload nginx"
