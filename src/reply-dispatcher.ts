import {
  createReplyPrefixContext,
  type ClawdbotConfig,
  type ReplyPayload,
  type RuntimeEnv,
} from "openclaw/plugin-sdk";
import type { WsOutboundMessage } from "./types.js";
import { getWsRuntime } from "./runtime.js";

export interface WsReplyDispatcherOptions {
  cfg: ClawdbotConfig;
  agentId: string;
  runtime: RuntimeEnv;
  connectionId: string;
  messageId: string;
  send: (msg: WsOutboundMessage) => void;
}

export function createWsReplyDispatcher(options: WsReplyDispatcherOptions) {
  const { cfg, agentId, connectionId, messageId, send, runtime } = options;
  const core = getWsRuntime();
  const prefixContext = createReplyPrefixContext({ cfg, agentId });

  const textChunkLimit = 4000;

  const { dispatcher, replyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      responsePrefix: prefixContext.responsePrefix,
      responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
      humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, agentId),
      onReplyStart: () => {
        send({ type: "chat.typing" });
      },
      deliver: async (payload: ReplyPayload, info) => {
        const text = payload.text ?? "";
        if (!text.trim()) {
          return;
        }

        const isFinal = info?.kind === "final";

        for (const chunk of core.channel.text.chunkTextWithMode(text, textChunkLimit, "newline")) {
          send({
            type: isFinal ? "chat.response" : "chat.stream",
            messageId,
            content: chunk,
            done: isFinal,
          });
        }
      },
      onError: async (error, info) => {
        runtime.error?.(`ws: ${info.kind} reply failed: ${String(error)}`);
        send({
          type: "chat.error",
          messageId,
          error: String(error),
        });
      },
      onIdle: async () => {
        // Nothing to clean up
      },
      onCleanup: () => {
        // Nothing to clean up
      },
    });

  return {
    dispatcher,
    replyOptions: {
      ...replyOptions,
      onModelSelected: prefixContext.onModelSelected,
      onPartialReply: (payload: ReplyPayload) => {
        const text = payload.text ?? "";
        if (!text.trim()) {
          return;
        }
        send({
          type: "chat.stream",
          messageId,
          content: text,
          done: false,
        });
      },
    },
    markDispatchIdle,
  };
}
