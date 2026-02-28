import { WebSocketServer, WebSocket, RawData } from "ws";
import type { IncomingMessage } from "http";
import type { WsConfig, WsAuthConfig, WsInboundMessage, WsOutboundMessage, WsMessageContext } from "./types.js";
import { verifyToken, AuthError, type AuthResult } from "./auth.js";
import { randomUUID } from "crypto";

export interface WsServerOptions {
  config: WsConfig;
  onMessage: (ctx: WsMessageContext, send: (msg: WsOutboundMessage) => void) => Promise<void>;
  log?: (...args: any[]) => void;
}

interface ClientConnection {
  id: string;
  ws: WebSocket;
  senderId: string;
  senderName?: string;
  authenticated: boolean;
  token?: string;
  authInfo?: AuthResult;
  connectedAt: number;
}

export class WsChatServer {
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, ClientConnection>();
  private config: WsConfig;
  private onMessage: WsServerOptions["onMessage"];
  private log: (...args: any[]) => void;

  constructor(options: WsServerOptions) {
    this.config = options.config;
    this.onMessage = options.onMessage;
    this.log = options.log ?? console.log;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.config.port,
          host: this.config.host,
          path: this.config.path,
        });

        this.wss.on("connection", (ws, req) => this.handleConnection(ws, req));

        this.wss.on("listening", () => {
          this.log(`websocket: server listening on ${this.config.host}:${this.config.port}${this.config.path}`);
          this.log(`websocket: auth ${this.authEnabled ? "ENABLED" : "DISABLED"}${this.authEnabled && this.authConfig?.required ? " (required)" : ""}`);
          resolve();
        });

        this.wss.on("error", (err) => {
          this.log(`ws: server error: ${err.message}`);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  stop(): void {
    if (this.wss) {
      for (const conn of this.connections.values()) {
        conn.ws.close(1000, "Server shutting down");
      }
      this.connections.clear();
      this.wss.close();
      this.wss = null;
      this.log("ws: server stopped");
    }
  }

  private get authConfig(): WsAuthConfig | undefined {
    return this.config.auth;
  }

  private get authEnabled(): boolean {
    return !!this.authConfig?.enabled;
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const connectionId = randomUUID();
    const urlParams = new URL(req.url ?? "/", `http://${req.headers.host}`).searchParams;

    let senderId = urlParams.get("senderId") ?? connectionId;
    let senderName = urlParams.get("senderName") ?? undefined;
    let authenticated = false;
    let token: string | undefined;
    let authInfo: AuthResult | undefined;

    if (this.authEnabled) {
      token = urlParams.get("token") ?? undefined;
      if (token) {
        try {
          const authParams: Record<string, string> = {};
          urlParams.forEach((value, key) => { authParams[key] = value; });
          if (!authParams.tokenType) {
            authParams.tokenType = "local";
          }
          authInfo = await verifyToken(this.authConfig!, authParams);
          senderId = authInfo.userId;
          senderName = authInfo.username;
          authenticated = true;
          this.log(`websocket: auth ok id=${connectionId} userId=${senderId} tokenType=${authParams.tokenType}`);
        } catch (err) {
          if (this.authConfig!.required) {
            this.log(`websocket: auth failed id=${connectionId}: ${(err as Error).message}`);
            ws.send(JSON.stringify({
              type: "chat.error",
              error: `Authentication failed: ${(err as AuthError).code ?? "unknown"}`,
            }));
            ws.close(4401, "Authentication failed");
            return;
          }
          this.log(`websocket: auth failed (non-required) id=${connectionId}, allowing anonymous`);
        }
      } else if (this.authConfig!.required) {
        ws.send(JSON.stringify({
          type: "chat.error",
          error: "Token required. Connect with ?token=YOUR_TOKEN",
        }));
        ws.close(4401, "Token required");
        return;
      }
    }

    const conn: ClientConnection = {
      id: connectionId,
      ws,
      senderId,
      senderName,
      authenticated,
      token,
      authInfo,
      connectedAt: Date.now(),
    };

    this.connections.set(connectionId, conn);
    this.log(`websocket: client connected id=${connectionId} senderId=${senderId} auth=${authenticated}`);

    ws.on("message", (data) => this.handleMessage(conn, data));

    ws.on("close", (code, reason) => {
      this.connections.delete(connectionId);
      this.log(`websocket: client disconnected id=${connectionId} code=${code}`);
    });

    ws.on("error", (err) => {
      this.log(`websocket: client error id=${connectionId}: ${err.message}`);
    });

    this.sendToClient(conn, {
      type: "chat.response",
      content: "Connected to WebSocket chat server",
    });
  }

  private async handleMessage(conn: ClientConnection, data: RawData): Promise<void> {
    try {
      const raw = data.toString();
      const msg: WsInboundMessage = JSON.parse(raw);

      if (msg.type !== "chat.send" || !msg.content) {
        this.sendToClient(conn, {
          type: "chat.error",
          error: "Invalid message format. Expected: { type: 'chat.send', content: '...' }",
        });
        return;
      }

      const ctx: WsMessageContext = {
        connectionId: conn.id,
        messageId: msg.messageId ?? randomUUID(),
        senderId: msg.senderId ?? conn.senderId,
        senderName: msg.senderName ?? conn.senderName,
        content: msg.content,
        timestamp: Date.now(),
        // 鉴权信息
        token: conn.token,
        authData: conn.authInfo ? { ...conn.authInfo } as Record<string, unknown> : undefined,
        // 扩展字段
        chatType: msg.chatType ?? "direct",
        groupId: msg.groupId,
        groupSubject: msg.groupSubject,
        replyToMessageId: msg.replyToMessageId,
        replyToBody: msg.replyToBody,
        mediaPath: msg.mediaPath,
        mediaType: msg.mediaType,
        mediaPaths: msg.mediaPaths,
        mediaTypes: msg.mediaTypes,
        customData: msg.customData,
      };

      this.sendToClient(conn, { type: "chat.typing" });

      await this.onMessage(ctx, (outMsg) => this.sendToClient(conn, outMsg));
    } catch (err) {
      this.log(`ws: message parse error: ${err}`);
      this.sendToClient(conn, {
        type: "chat.error",
        error: "Failed to parse message",
      });
    }
  }

  private sendToClient(conn: ClientConnection, msg: WsOutboundMessage): void {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(msg));
    }
  }

  sendToConnection(connectionId: string, msg: WsOutboundMessage): boolean {
    const conn = this.connections.get(connectionId);
    if (conn) {
      this.sendToClient(conn, msg);
      return true;
    }
    return false;
  }

  broadcast(msg: WsOutboundMessage): void {
    for (const conn of this.connections.values()) {
      this.sendToClient(conn, msg);
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}

let serverInstance: WsChatServer | null = null;

export function getWsServer(): WsChatServer | null {
  return serverInstance;
}

export function setWsServer(server: WsChatServer | null): void {
  serverInstance = server;
}
