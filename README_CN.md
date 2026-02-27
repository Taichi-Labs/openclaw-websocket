# openclaw-websocket

[![npm version](https://img.shields.io/npm/v/@taichi-labs/openclaw-websocket.svg)](https://www.npmjs.com/package/@taichi-labs/openclaw-websocket)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

OpenClaw WebSocket 聊天渠道插件 - 通过 WebSocket 连接你的应用到 OpenClaw AI Agent。

[English](./README.md)

## 功能特性

- 通过 WebSocket 实现实时双向通信
- 支持流式输出 AI Agent 回复
- 每个用户独立会话记忆
- 支持私聊和群聊
- 支持媒体附件和引用回复
- 易于集成到任何平台

## 安装

```bash
# 从 npm 安装
openclaw plugins install @taichi-labs/openclaw-websocket

# 或从 GitHub 安装
openclaw plugins install github:Taichi-Labs/openclaw-websocket
```

## 配置

在 OpenClaw 配置文件中添加：

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

或 YAML 格式：

```yaml
channels:
  ws:
    enabled: true
    port: 18800
    host: "0.0.0.0"
    path: "/ws"
```

### 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 启用/禁用 WebSocket 渠道 |
| `port` | number | `18800` | WebSocket 服务端口 |
| `host` | string | `"0.0.0.0"` | 服务器监听地址 |
| `path` | string | `"/ws"` | WebSocket 端点路径 |

## 快速开始

```bash
# 安装 wscat（如果还没安装）
npm install -g wscat

# 启动 OpenClaw
openclaw start

# 连接 WebSocket 服务器
wscat -c "ws://127.0.0.1:18800/ws?senderId=user1&senderName=张三"
```

连接后，可以尝试以下测试用例：

```bash
# 基本消息
{"type":"chat.send","content":"你好！"}

# 带自定义发送者的消息
{"type":"chat.send","content":"你好！","senderId":"user_123","senderName":"小明"}

# 多轮对话（Agent 会记住上下文）
{"type":"chat.send","content":"我叫张三"}
{"type":"chat.send","content":"我叫什么名字？"}

# 回复消息
{"type":"chat.send","content":"我同意","replyToBody":"我们用 Python 来做这个项目吧"}

# 群聊消息
{"type":"chat.send","content":"大家好！","chatType":"group","groupId":"dev-team","groupSubject":"开发组"}

# 带自定义数据的消息
{"type":"chat.send","content":"处理这个","customData":{"priority":"high","source":"api"}}

# 长消息
{"type":"chat.send","content":"请用 Python 写一个计算阶乘的函数，分别用递归和迭代两种方式实现，并比较它们的性能。"}
```

### 快速测试脚本

```bash
# 一行命令测试（发送后断开）
echo '{"type":"chat.send","content":"你好！"}' | wscat -c "ws://127.0.0.1:18800/ws?senderId=test"

# 测试不同用户（独立会话）
wscat -c "ws://127.0.0.1:18800/ws?senderId=xiaoming" -x '{"type":"chat.send","content":"我是小明"}'
wscat -c "ws://127.0.0.1:18800/ws?senderId=xiaohong" -x '{"type":"chat.send","content":"我是小红"}'
```

## 消息协议

### 发送消息

```json
{
  "type": "chat.send",
  "content": "你的消息内容",
  
  "messageId": "msg_001",
  "senderId": "user_123",
  "senderName": "张三",
  
  "chatType": "direct",
  "groupId": "group_001",
  "groupSubject": "技术讨论群",
  
  "replyToMessageId": "msg_000",
  "replyToBody": "被引用的消息内容",
  
  "mediaPath": "/path/to/file.png",
  "mediaType": "image/png",
  
  "customData": {
    "key": "value"
  }
}
```

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | ✅ | 固定为 `"chat.send"` |
| `content` | string | ✅ | 消息内容 |
| `messageId` | string | ❌ | 自定义消息ID（不填则自动生成） |
| `senderId` | string | ❌ | 发送者标识，用于会话路由 |
| `senderName` | string | ❌ | 发送者显示名称 |
| `chatType` | string | ❌ | `"direct"` 或 `"group"`（默认: `"direct"`） |
| `groupId` | string | ❌ | 群组标识（群聊时必填） |
| `groupSubject` | string | ❌ | 群组名称 |
| `replyToMessageId` | string | ❌ | 被回复消息的ID |
| `replyToBody` | string | ❌ | 被引用的消息内容 |
| `mediaPath` | string | ❌ | 媒体文件路径 |
| `mediaType` | string | ❌ | 媒体 MIME 类型 |
| `mediaPaths` | string[] | ❌ | 多个媒体文件路径 |
| `mediaTypes` | string[] | ❌ | 多个媒体的 MIME 类型 |
| `customData` | object | ❌ | 自定义数据，透传给 Agent |

### 接收响应

```json
// 正在输入指示
{ "type": "chat.typing" }

// 流式响应（部分内容）
{ "type": "chat.stream", "messageId": "xxx", "content": "部分内容...", "done": false }

// 最终响应
{ "type": "chat.response", "messageId": "xxx", "content": "完整回复", "done": true }

// 错误响应
{ "type": "chat.error", "messageId": "xxx", "error": "错误信息" }
```

#### 响应类型

| 类型 | 说明 |
|------|------|
| `chat.typing` | Agent 正在处理请求 |
| `chat.stream` | 流式输出的部分内容 |
| `chat.response` | 最终完整响应 |
| `chat.error` | 处理过程中发生错误 |

## 代码示例

### JavaScript / Node.js

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:18800/ws?senderId=user1&senderName=张三');

ws.on('open', () => {
  console.log('已连接');
  ws.send(JSON.stringify({
    type: 'chat.send',
    content: '你好，请问有什么可以帮助你的？'
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  switch (msg.type) {
    case 'chat.typing':
      console.log('Agent 正在输入...');
      break;
    case 'chat.stream':
      process.stdout.write(msg.content);
      break;
    case 'chat.response':
      console.log('\nAgent:', msg.content);
      break;
    case 'chat.error':
      console.error('错误:', msg.error);
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
        print(f"错误: {msg['error']}")

def on_open(ws):
    ws.send(json.dumps({
        'type': 'chat.send',
        'content': '你好！'
    }))

ws = websocket.WebSocketApp(
    'ws://127.0.0.1:18800/ws?senderId=user1&senderName=张三',
    on_message=on_message,
    on_open=on_open
)
ws.run_forever()
```

### cURL (通过 websocat)

```bash
echo '{"type":"chat.send","content":"你好！"}' | \
  websocat 'ws://127.0.0.1:18800/ws?senderId=user1'
```

## 会话管理

每个唯一的 `senderId` 都会与 AI Agent 保持独立的会话。这意味着：

- 用户 A 的对话历史与用户 B 完全独立
- Agent 会记住每个用户会话内的上下文
- 群聊基于 `groupId` 共享同一个会话

```javascript
// 用户 A 的会话
ws.send(JSON.stringify({ type: 'chat.send', senderId: 'user_A', content: '我叫张三' }));

// 用户 B 的会话（独立）
ws.send(JSON.stringify({ type: 'chat.send', senderId: 'user_B', content: '我叫李四' }));

// 用户 A 继续对话（Agent 记得他叫"张三"）
ws.send(JSON.stringify({ type: 'chat.send', senderId: 'user_A', content: '我叫什么名字？' }));
```

## URL 参数

连接时可以通过 URL 查询参数传递用户信息：

```
ws://127.0.0.1:18800/ws?senderId=user123&senderName=张三
```

| 参数 | 说明 |
|------|------|
| `senderId` | 该连接的默认发送者ID |
| `senderName` | 该连接的默认显示名称 |

## 贡献

欢迎贡献代码！请随时提交 Pull Request。

## 开源协议

[MIT](./LICENSE)
