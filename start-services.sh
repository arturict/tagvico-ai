#!/bin/bash
# start-services.sh - Start the Tagvico AI Node.js service
set -e

echo "Starting Tagvico AI services..."
exec node scripts/start-production.js
