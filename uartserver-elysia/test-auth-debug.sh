#!/bin/bash

# Kill existing server
pkill -9 bun
sleep 2

# Start server in background and save PID
bun run dev &
SERVER_PID=$!

# Wait for server to start
sleep 6

# Get token
echo "===== Getting auth token ====="
TOKEN=$(curl -s http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"data":{"username":"test_device_user","password":"test-password"}}' \
  | jq -r '.data.accessToken')

echo "Token: ${TOKEN:0:30}..."

# Test debug endpoint
echo ""
echo "===== Testing debug endpoint ====="
curl -s http://localhost:3333/api/terminals/debug-userid \
  -H "Authorization: Bearer $TOKEN" \
  | jq .

# Kill server
echo ""
echo "===== Cleaning up ====="
kill $SERVER_PID 2>/dev/null
sleep 1
