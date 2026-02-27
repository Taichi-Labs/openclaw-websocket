import { z } from "zod";

export const WsConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  port: z.number().optional().default(18800),
  host: z.string().optional().default("0.0.0.0"),
  path: z.string().optional().default("/ws"),
  dmPolicy: z.enum(["open", "pairing", "allowlist"]).optional().default("open"),
  allowFrom: z.array(z.string()).optional().default([]),
});

export type WsConfig = z.infer<typeof WsConfigSchema>;

export interface WsMessageContext {
  connectionId: string;
  messageId: string;
  senderId: string;
  senderName?: string;
  content: string;
  timestamp: number;
  // 扩展字段
  chatType: "direct" | "group";
  groupId?: string;
  groupSubject?: string;
  replyToMessageId?: string;
  replyToBody?: string;
  mediaPath?: string;
  mediaType?: string;
  mediaPaths?: string[];
  mediaTypes?: string[];
  customData?: Record<string, unknown>;
}

export interface WsInboundMessage {
  type: "chat.send";
  // 基础字段
  messageId?: string;
  content: string;
  // 用户信息
  senderId?: string;
  senderName?: string;
  // 会话信息
  sessionKey?: string;
  chatType?: "direct" | "group";
  groupId?: string;
  groupSubject?: string;
  // 引用回复
  replyToMessageId?: string;
  replyToBody?: string;
  // 媒体附件
  mediaPath?: string;
  mediaType?: string;
  mediaPaths?: string[];
  mediaTypes?: string[];
  // 自定义数据（透传给 Agent）
  customData?: Record<string, unknown>;
}

export interface WsOutboundMessage {
  type: "chat.response" | "chat.stream" | "chat.error" | "chat.typing";
  messageId?: string;
  content?: string;
  error?: string;
  done?: boolean;
}

export interface ResolvedWsAccount {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  config?: WsConfig;
}
