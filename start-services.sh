#!/bin/bash
# start-services.sh - Start the paperlesser Node.js service
set -e

echo "Starting paperlesser (Node.js) service..."
exec pm2-runtime ecosystem.config.js
