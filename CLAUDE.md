# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 概述

这是 OpenClaw 的 WebSocket 聊天频道插件，允许应用通过 WebSocket 连接到 OpenClaw AI Agent，实现实时双向通信。

## 构建命令

```bash
npm run build        # 编译 TypeScript 到 dist/
npm run test:unit    # 用 Vitest 运行单元测试
npm run test:unit:watch  # 测试监听模式
npm run ci:check     # TypeScript 类型检查
```

## 架构

### 入口文件
- `index.ts` - 插件入口，导出实现 `OpenClawPluginApi` 的 `plugin` 对象

### 核心组件

**`src/channel.ts`** - 频道插件定义
- 定义实现 `ChannelPlugin` 接口的 `wsPlugin`
- 注册频道能力、配置 schema、网关启动处理器
- 处理 WebSocket 连接与 Agent 之间的路由

**`src/websocket-server.ts`** - WebSocket 服务器（`WsChatServer` 类）
- 管理 WebSocket 连接和客户端会话
- 处理认证流程（通过 auth 服务验证 token）
- 解析收到的消息并转发给 `handleWsMessage`

**`src/bot.ts`** - 消息处理器
- 处理收到的 `chat.send` 消息
- 通过 `core.channel.routing.resolveAgentRoute()` 路由到对应 Agent
- 处理会话管理和动态 Agent 创建

**`src/auth.ts`** - Token 验证
- `verifyToken()` 调用外部 auth 服务端点
- 期望响应格式：`{ success: true, data: { userId, username, avatar?, extra? } }`

**`src/reply-dispatcher.ts`** - 将 Agent 响应流式发送回 WebSocket 客户端

**`src/dynamic-agent.ts`** - 动态创建 per-user Agent（多租户支持）

**`src/runtime.ts`** / `src/monitor.ts`** - 运行时集成和服务器生命周期

### 数据流向

```
客户端 WebSocket → WsChatServer.handleConnection()
  → 认证（可选）
  → WsChatServer.handleMessage()
  → bot.ts 中的 handleWsMessage()
  → core.channel.reply.dispatchReplyFromConfig()
  → ReplyDispatcher 通过 WebSocket 流式推送响应
```

### 消息协议

**入站**（`chat.send`）：
```json
{ "type": "chat.send", "content": "...", "senderId": "user1" }
```

**出站**：
- `chat.typing` - Agent 正在处理
- `chat.stream` - 部分响应（流式）
- `chat.response` - 最终响应
- `chat.error` - 发生错误

## 配置

在 OpenClaw 配置文件中：
```json
{
  "channels": {
    "websocket": {
      "enabled": true,
      "port": 18800,
      "host": "0.0.0.0",
      "path": "/ws",
      "auth": {
        "enabled": true,
        "endpoint": "http://auth-service/api/verify",
        "timeout": 5000,
        "required": false
      }
    }
  }
}
```

环境变量会覆盖 auth 配置：
- `WS_AUTH_ENABLED`
- `WS_AUTH_ENDPOINT`

## 发布

```bash
npm login
npm publish --access public --otp=XXXX
```

包名：`@drtx32/openclaw-websocket`
