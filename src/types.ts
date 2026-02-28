import { z } from "zod";

export const WsAuthConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  endpoint: z.string().optional().default("http://localhost:3000/api/auth/verify"),
  timeout: z.number().optional().default(5000),
  required: z.boolean().optional().default(true),
});

export type WsAuthConfig = z.infer<typeof WsAuthConfigSchema>;

export const WsDynamicAgentSchema = z.object({
  enabled: z.boolean().optional().default(true),
  workspaceTemplate: z.string().optional(),
  agentDirTemplate: z.string().optional(),
  maxAgents: z.number().int().positive().optional(),
});

export const WsConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  port: z.number().optional().default(18800),
  host: z.string().optional().default("0.0.0.0"),
  path: z.string().optional().default("/ws"),
  dmPolicy: z.enum(["open", "pairing", "allowlist"]).optional().default("open"),
  allowFrom: z.array(z.string()).optional().default([]),
  auth: WsAuthConfigSchema.optional(),
  dynamicAgentCreation: WsDynamicAgentSchema.optional(),
});

export type WsConfig = z.infer<typeof WsConfigSchema>;

export interface WsMessageContext {
  connectionId: string;
  messageId: string;
  senderId: string;
  senderName?: string;
  content: string;
  timestamp: number;
  // 鉴权信息（auth 服务返回的完整数据）
  token?: string;
  authData?: Record<string, unknown>;
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
