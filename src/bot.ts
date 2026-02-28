import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { WsMessageContext, WsOutboundMessage, WsConfig } from "./types.js";
import { getWsRuntime } from "./runtime.js";
import { createWsReplyDispatcher } from "./reply-dispatcher.js";
import { maybeCreateDynamicAgent, type DynamicAgentCreationConfig } from "./dynamic-agent.js";

export async function handleWsMessage(params: {
  cfg: ClawdbotConfig;
  wsConfig: WsConfig;
  ctx: WsMessageContext;
  send: (msg: WsOutboundMessage) => void;
  accountId?: string;
}): Promise<void> {
  const { cfg, wsConfig, ctx, send, accountId = "default" } = params;

  const core = getWsRuntime();
  const log = core.log ?? console.log;
  const error = core.error ?? console.error;

  const isGroup = ctx.chatType === "group";
  log(`ws[${accountId}]: received message from ${ctx.senderId}: ${ctx.content.slice(0, 100)}`);

  try {
    const wsFrom = `ws:${ctx.senderId}`;
    const wsTo = isGroup ? `ws:group:${ctx.groupId}` : `ws:${ctx.connectionId}`;
    const peerId = isGroup ? ctx.groupId! : ctx.senderId;

    let route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "websocket",
      accountId,
      peer: {
        kind: isGroup ? "group" : "direct",
        id: peerId,
      },
    });

    let effectiveCfg = cfg;
    if (!isGroup && route.matchedBy === "default") {
      const dynamicCfg = wsConfig.dynamicAgentCreation;
      if (dynamicCfg?.enabled) {
        log(`websocket[${accountId}]: dynamic agent creation triggered for ${ctx.senderId}`);
        const result = await maybeCreateDynamicAgent({
          cfg,
          runtime: core,
          senderId: ctx.senderId,
          dynamicCfg,
          accountId,
          userProfile: ctx.authData
            ? {
                userId: (ctx.authData.userId as string) ?? ctx.senderId,
                username: (ctx.authData.username as string) ?? ctx.senderName ?? ctx.senderId,
                extra: (ctx.authData.extra as Record<string, unknown>) ?? {},
              }
            : undefined,
          log: (msg) => log(msg),
        });
        if (result.created) {
          effectiveCfg = result.updatedCfg;
          route = core.channel.routing.resolveAgentRoute({
            cfg: result.updatedCfg,
            channel: "websocket",
            accountId,
            peer: { kind: "direct", id: ctx.senderId },
          });
          log(`websocket[${accountId}]: dynamic agent created, route: ${route.sessionKey}`);
        }
      }
    }

    const preview = ctx.content.replace(/\s+/g, " ").slice(0, 160);
    const inboundLabel = isGroup
      ? `WebSocket[${accountId}] message in group ${ctx.groupId}`
      : `WebSocket[${accountId}] message from ${ctx.senderId}`;

    core.system.enqueueSystemEvent(`${inboundLabel}: ${preview}`, {
      sessionKey: route.sessionKey,
      contextKey: `ws:message:${ctx.connectionId}:${ctx.messageId}`,
    });

    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(effectiveCfg);

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
      Provider: "websocket" as const,
      Surface: "websocket" as const,
      MessageSid: ctx.messageId,
      Timestamp: ctx.timestamp,
      WasMentioned: true,
      OriginatingChannel: "websocket" as const,
      OriginatingTo: wsTo,
      ReplyToBody: ctx.replyToBody,
      ...mediaPayload,
      // 用户 token 透传给 Agent（用于调用外部 API）
      ...(ctx.token ? { UserToken: ctx.token } : {}),
      // auth 服务返回的完整用户数据
      ...(ctx.authData ?? {}),
      // 自定义数据透传
      ...(ctx.customData ?? {}),
    });

    const { dispatcher, replyOptions, markDispatchIdle } = createWsReplyDispatcher({
      cfg: effectiveCfg,
      agentId: route.agentId,
      runtime: core,
      connectionId: ctx.connectionId,
      messageId: ctx.messageId,
      send,
    });

    log(`ws[${accountId}]: dispatching to agent (session=${route.sessionKey})`);

    const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg: effectiveCfg,
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
