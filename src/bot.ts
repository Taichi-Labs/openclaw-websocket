import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { WsMessageContext, WsOutboundMessage, WsConfig } from "./types.js";
import { getWsRuntime } from "./runtime.js";
import { createWsReplyDispatcher } from "./reply-dispatcher.js";

export async function handleWsMessage(params: {
  cfg: ClawdbotConfig;
  ctx: WsMessageContext;
  send: (msg: WsOutboundMessage) => void;
  accountId?: string;
}): Promise<void> {
  const { cfg, ctx, send, accountId = "default" } = params;

  const core = getWsRuntime();
  const log = core.log ?? console.log;
  const error = core.error ?? console.error;

  const isGroup = ctx.chatType === "group";
  log(`ws[${accountId}]: received message from ${ctx.senderId}: ${ctx.content.slice(0, 100)}`);

  try {
    const wsFrom = `ws:${ctx.senderId}`;
    const wsTo = isGroup ? `ws:group:${ctx.groupId}` : `ws:${ctx.connectionId}`;
    const peerId = isGroup ? ctx.groupId! : ctx.senderId;

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "ws",
      accountId,
      peer: {
        kind: isGroup ? "group" : "direct",
        id: peerId,
      },
    });

    const preview = ctx.content.replace(/\s+/g, " ").slice(0, 160);
    const inboundLabel = isGroup
      ? `WebSocket[${accountId}] message in group ${ctx.groupId}`
      : `WebSocket[${accountId}] message from ${ctx.senderId}`;

    core.system.enqueueSystemEvent(`${inboundLabel}: ${preview}`, {
      sessionKey: route.sessionKey,
      contextKey: `ws:message:${ctx.connectionId}:${ctx.messageId}`,
    });

    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);

    const speaker = ctx.senderName ?? ctx.senderId;
    let messageBody = `${speaker}: ${ctx.content}`;

    // 添加引用消息内容
    if (ctx.replyToBody) {
      messageBody = `[Replying to: "${ctx.replyToBody}"]\n\n${messageBody}`;
    }

    const body = core.channel.reply.formatAgentEnvelope({
      channel: "WebSocket",
      from: isGroup ? `${ctx.groupId}:${ctx.senderId}` : ctx.senderId,
      timestamp: new Date(ctx.timestamp),
      envelope: envelopeOptions,
      body: messageBody,
    });

    // 构建媒体 payload
    const mediaPayload: Record<string, unknown> = {};
    if (ctx.mediaPath) {
      mediaPayload.MediaPath = ctx.mediaPath;
      mediaPayload.MediaUrl = ctx.mediaPath;
    }
    if (ctx.mediaType) {
      mediaPayload.MediaType = ctx.mediaType;
    }
    if (ctx.mediaPaths && ctx.mediaPaths.length > 0) {
      mediaPayload.MediaPaths = ctx.mediaPaths;
      mediaPayload.MediaUrls = ctx.mediaPaths;
    }
    if (ctx.mediaTypes && ctx.mediaTypes.length > 0) {
      mediaPayload.MediaTypes = ctx.mediaTypes;
    }

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: body,
      RawBody: ctx.content,
      CommandBody: ctx.content,
      From: wsFrom,
      To: wsTo,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: isGroup ? "group" : "direct",
      GroupSubject: isGroup ? (ctx.groupSubject ?? ctx.groupId) : undefined,
      SenderName: ctx.senderName ?? ctx.senderId,
      SenderId: ctx.senderId,
      Provider: "ws" as const,
      Surface: "ws" as const,
      MessageSid: ctx.messageId,
      Timestamp: ctx.timestamp,
      WasMentioned: true,
      OriginatingChannel: "ws" as const,
      OriginatingTo: wsTo,
      ReplyToBody: ctx.replyToBody,
      ...mediaPayload,
      // 自定义数据透传
      ...(ctx.customData ?? {}),
    });

    const { dispatcher, replyOptions, markDispatchIdle } = createWsReplyDispatcher({
      cfg,
      agentId: route.agentId,
      runtime: core,
      connectionId: ctx.connectionId,
      messageId: ctx.messageId,
      send,
    });

    log(`ws[${accountId}]: dispatching to agent (session=${route.sessionKey})`);

    const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });

    markDispatchIdle();

    log(`ws[${accountId}]: dispatch complete (queuedFinal=${queuedFinal}, replies=${counts.final})`);
  } catch (err) {
    error(`ws[${accountId}]: failed to dispatch message: ${String(err)}`);
    send({
      type: "chat.error",
      messageId: ctx.messageId,
      error: `Failed to process message: ${String(err)}`,
    });
  }
}
