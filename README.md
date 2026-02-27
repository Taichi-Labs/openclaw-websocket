# openclaw-websocket

[![npm version](https://img.shields.io/npm/v/openclaw-websocket.svg)](https://www.npmjs.com/package/openclaw-websocket)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

OpenClaw WebSocket channel plugin - Connect your applications to OpenClaw AI agents via WebSocket.

[中文文档](./README_CN.md)

## Features

- Real-time bidirectional communication via WebSocket
- Stream responses from OpenClaw AI agents
- Independent session memory for each user
- Support for direct messages and group chats
- Media attachments and reply quotes
- Easy integration with any platform

## Installation

```bash
# Install from npm
openclaw plugin install openclaw-websocket

# Or install from GitHub
openclaw plugin install github:Taichi-Labs/openclaw-websocket
```

## Configuration

Add to your OpenClaw configuration file:

```json
{
  "channels": {
    "ws": {
      "enabled": true,
      "port": 18800,
      "host": "0.0.0.0",
      "path": "/ws"
    }
  }
}
```

Or in YAML format:

```yaml
channels:
  ws:
    enabled: true
    port: 18800
    host: "0.0.0.0"
    path: "/ws"
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the WebSocket channel |
| `port` | number | `18800` | WebSocket server port |
| `host` | string | `"0.0.0.0"` | Server bind address |
| `path` | string | `"/ws"` | WebSocket endpoint path |

## Quick Start

```bash
# Install wscat if not already installed
npm install -g wscat

# Start OpenClaw
openclaw start

# Connect to WebSocket server
wscat -c "ws://127.0.0.1:18800/ws?senderId=user1&senderName=John"
```

After connecting, try these test cases:

```bash
# Basic message
{"type":"chat.send","content":"Hello!"}

# Message with custom sender
{"type":"chat.send","content":"Hi there!","senderId":"user_123","senderName":"Alice"}

# Multi-turn conversation (agent remembers context)
{"type":"chat.send","content":"My name is John"}
{"type":"chat.send","content":"What is my name?"}

# Reply to a message
{"type":"chat.send","content":"I agree","replyToBody":"Let's use Python for this project"}

# Group chat message
{"type":"chat.send","content":"Hello everyone!","chatType":"group","groupId":"dev-team","groupSubject":"Dev Team"}

# Message with custom data
{"type":"chat.send","content":"Process this","customData":{"priority":"high","source":"api"}}

# Long message
{"type":"chat.send","content":"Please write a Python function that calculates the factorial of a number recursively and iteratively, then compare their performance."}
```

### Quick Test Script

```bash
# One-liner test (send and disconnect)
echo '{"type":"chat.send","content":"Hello!"}' | wscat -c "ws://127.0.0.1:18800/ws?senderId=test"

# Test different users (separate sessions)
wscat -c "ws://127.0.0.1:18800/ws?senderId=alice" -x '{"type":"chat.send","content":"I am Alice"}'
wscat -c "ws://127.0.0.1:18800/ws?senderId=bob" -x '{"type":"chat.send","content":"I am Bob"}'
```

## Message Protocol

### Sending Messages

```json
{
  "type": "chat.send",
  "content": "Your message here",
  
  "messageId": "msg_001",
  "senderId": "user_123",
  "senderName": "John Doe",
  
  "chatType": "direct",
  "groupId": "group_001",
  "groupSubject": "Tech Discussion",
  
  "replyToMessageId": "msg_000",
  "replyToBody": "Original message being replied to",
  
  "mediaPath": "/path/to/file.png",
  "mediaType": "image/png",
  
  "customData": {
    "key": "value"
  }
}
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | ✅ | Must be `"chat.send"` |
| `content` | string | ✅ | Message content |
| `messageId` | string | ❌ | Custom message ID (auto-generated if omitted) |
| `senderId` | string | ❌ | Sender identifier for session routing |
| `senderName` | string | ❌ | Display name of the sender |
| `chatType` | string | ❌ | `"direct"` or `"group"` (default: `"direct"`) |
| `groupId` | string | ❌ | Group identifier (required for group chats) |
| `groupSubject` | string | ❌ | Group name/subject |
| `replyToMessageId` | string | ❌ | ID of the message being replied to |
| `replyToBody` | string | ❌ | Content of the quoted message |
| `mediaPath` | string | ❌ | Path to media attachment |
| `mediaType` | string | ❌ | MIME type of the media |
| `mediaPaths` | string[] | ❌ | Multiple media file paths |
| `mediaTypes` | string[] | ❌ | MIME types for multiple media |
| `customData` | object | ❌ | Custom data passed to the agent |

### Receiving Responses

```json
// Typing indicator
{ "type": "chat.typing" }

// Streaming response (partial content)
{ "type": "chat.stream", "messageId": "xxx", "content": "Partial...", "done": false }

// Final response
{ "type": "chat.response", "messageId": "xxx", "content": "Complete response", "done": true }

// Error response
{ "type": "chat.error", "messageId": "xxx", "error": "Error message" }
```

#### Response Types

| Type | Description |
|------|-------------|
| `chat.typing` | Agent is processing the request |
| `chat.stream` | Partial streaming response |
| `chat.response` | Final complete response |
| `chat.error` | Error occurred during processing |

## Code Examples

### JavaScript / Node.js

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:18800/ws?senderId=user1&senderName=John');

ws.on('open', () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    type: 'chat.send',
    content: 'Hello, how are you?'
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  switch (msg.type) {
    case 'chat.typing':
      console.log('Agent is typing...');
      break;
    case 'chat.stream':
      process.stdout.write(msg.content);
      break;
    case 'chat.response':
      console.log('\nAgent:', msg.content);
      break;
    case 'chat.error':
      console.error('Error:', msg.error);
      break;
  }
});
```

### Python

```python
import websocket
import json

def on_message(ws, message):
    msg = json.loads(message)
    if msg['type'] == 'chat.response':
        print(f"Agent: {msg['content']}")
    elif msg['type'] == 'chat.error':
        print(f"Error: {msg['error']}")

def on_open(ws):
    ws.send(json.dumps({
        'type': 'chat.send',
        'content': 'Hello!'
    }))

ws = websocket.WebSocketApp(
    'ws://127.0.0.1:18800/ws?senderId=user1&senderName=John',
    on_message=on_message,
    on_open=on_open
)
ws.run_forever()
```

### cURL (via websocat)

```bash
echo '{"type":"chat.send","content":"Hello!"}' | \
  websocat 'ws://127.0.0.1:18800/ws?senderId=user1'
```

## Session Management

Each unique `senderId` maintains an independent conversation session with the AI agent. This means:

- User A's conversation history is separate from User B's
- The agent remembers context within each user's session
- Group chats share a session based on `groupId`

```javascript
// User A's session
ws.send(JSON.stringify({ type: 'chat.send', senderId: 'user_A', content: 'My name is Alice' }));

// User B's session (independent)
ws.send(JSON.stringify({ type: 'chat.send', senderId: 'user_B', content: 'My name is Bob' }));

// User A asking (agent remembers "Alice")
ws.send(JSON.stringify({ type: 'chat.send', senderId: 'user_A', content: 'What is my name?' }));
```

## URL Parameters

You can pass user information via URL query parameters when connecting:

```
ws://127.0.0.1:18800/ws?senderId=user123&senderName=John%20Doe
```

| Parameter | Description |
|-----------|-------------|
| `senderId` | Default sender ID for this connection |
| `senderName` | Default display name for this connection |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT](./LICENSE)
