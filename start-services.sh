#!/bin/bash
# start-services.sh - Start the Archivista AI Node.js service
set -e

echo "Starting Archivista AI (Node.js) service..."
exec pm2-runtime ecosystem.config.js
