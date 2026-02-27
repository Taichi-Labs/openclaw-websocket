/**
 * WebSocket 聊天客户端示例
 * 用于测试 OpenClaw WebSocket 插件
 *
 * 运行: npx tsx example-client.ts
 */

import WebSocket from "ws";

interface WsOutboundMessage {
  type: "chat.response" | "chat.stream" | "chat.error" | "chat.typing";
  messageId?: string;
  content?: string;
  error?: string;
  done?: boolean;
}

class WsChatClient {
  private ws: WebSocket;
  private messageId = 0;
  private senderId: string;

  constructor(serverUrl: string = "ws://127.0.0.1:18800/ws", senderId?: string) {
    this.senderId = senderId ?? `user_${Date.now()}`;
    const url = new URL(serverUrl);
    url.searchParams.set("senderId", this.senderId);
    url.searchParams.set("senderName", "TestUser");

    this.ws = new WebSocket(url.toString());
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.ws.on("open", () => {
      console.log("✓ Connected to WebSocket server");
    });

    this.ws.on("message", (data) => {
      const msg: WsOutboundMessage = JSON.parse(data.toString());
      this.handleMessage(msg);
    });

    this.ws.on("close", (code, reason) => {
      console.log(`Connection closed: ${code} - ${reason}`);
    });

    this.ws.on("error", (err) => {
      console.error("WebSocket error:", err.message);
    });
  }

  private handleMessage(msg: WsOutboundMessage): void {
    switch (msg.type) {
      case "chat.typing":
        process.stdout.write("⏳ Agent is typing...\r");
        break;
      case "chat.stream":
        process.stdout.write(`\r${msg.content}`);
        break;
      case "chat.response":
        console.log(`\n🤖 Agent: ${msg.content}`);
        break;
      case "chat.error":
        console.error(`❌ Error: ${msg.error}`);
        break;
    }
  }

  async sendMessage(content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const msg = {
        type: "chat.send",
        messageId: `msg_${++this.messageId}`,
        content,
      };

      console.log(`\n👤 You: ${content}`);
      this.ws.send(JSON.stringify(msg));

      setTimeout(resolve, 100);
    });
  }

  close(): void {
    this.ws.close();
  }

  onReady(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        resolve();
      } else {
        this.ws.on("open", () => resolve());
      }
    });
  }
}

async function main() {
  const client = new WsChatClient();

  await client.onReady();

  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n📝 Type your message and press Enter (type 'exit' to quit):\n");

  const askQuestion = () => {
    rl.question("> ", async (input) => {
      const trimmed = input.trim();
      if (trimmed.toLowerCase() === "exit") {
        client.close();
        rl.close();
        return;
      }

      if (trimmed) {
        await client.sendMessage(trimmed);
      }

      setTimeout(askQuestion, 1000);
    });
  };

  askQuestion();
}

main().catch(console.error);
