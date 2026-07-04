#!/bin/bash
# start-services.sh - Start the Tagvico AI Node.js service
set -e

echo "Starting Tagvico AI (Node.js) service..."
exec pm2-runtime ecosystem.config.js
