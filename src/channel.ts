import type { ChannelPlugin, ClawdbotConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";
import type { ResolvedWsAccount, WsConfig } from "./types.js";

const meta = {
  id: "websocket",
  label: "WebSocket",
  selectionLabel: "WebSocket Chat",
  docsPath: "/channels/ws",
  docsLabel: "websocket",
  blurb: "WebSocket-based chat interface.",
  order: 100,
};

function resolveWsAccount(params: { cfg: ClawdbotConfig; accountId?: string }): ResolvedWsAccount {
  const { cfg, accountId = DEFAULT_ACCOUNT_ID } = params;
  const channelsCfg = cfg.channels as Record<string, unknown> | undefined;
  const wsCfg = channelsCfg?.websocket as WsConfig | undefined;

  const enabled = wsCfg?.enabled ?? true;
  const configured = true;

  return {
    accountId: normalizeAccountId(accountId),
    enabled,
    configured,
    config: wsCfg,
  };
}

function listWsAccountIds(cfg: ClawdbotConfig): string[] {
  return [DEFAULT_ACCOUNT_ID];
}

export const wsPlugin: ChannelPlugin<ResolvedWsAccount> = {
  id: "websocket",
  meta: {
    ...meta,
  },
  capabilities: {
    chatTypes: ["direct"],
    polls: false,
    threads: false,
    media: false,
    reactions: false,
    edit: false,
    reply: true,
  },
  reload: { configPrefixes: ["channels.websocket"] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        port: { type: "integer", minimum: 1, maximum: 65535 },
        host: { type: "string" },
        path: { type: "string" },
        dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
        allowFrom: { type: "array", items: { type: "string" } },
        auth: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: { type: "boolean" },
            endpoint: { type: "string" },
            timeout: { type: "integer", minimum: 1000 },
            required: { type: "boolean" },
          },
        },
        dynamicAgentCreation: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: { type: "boolean" },
            workspaceTemplate: { type: "string" },
            agentDirTemplate: { type: "string" },
            maxAgents: { type: "integer", minimum: 1 },
          },
        },
      },
    },
  },
  config: {
    listAccountIds: (cfg) => listWsAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveWsAccount({ cfg, accountId }),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          websocket: {
            ...(cfg.channels as Record<string, unknown>)?.websocket,
            enabled,
          },
        },
      };
    },
    deleteAccount: ({ cfg, accountId }) => {
      const next = { ...cfg } as ClawdbotConfig;
      const nextChannels = { ...cfg.channels } as Record<string, unknown>;
      delete nextChannels.websocket;
      if (Object.keys(nextChannels).length > 0) {
        next.channels = nextChannels;
      } else {
        delete next.channels;
      }
      return next;
    },
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
    }),
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      port: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      port: snapshot.port ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      port: runtime?.port ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const { monitorWsProvider } = await import("./monitor.js");
      const account = resolveWsAccount({ cfg: ctx.cfg, accountId: ctx.accountId });
      const port = account.config?.port ?? 18800;
      ctx.setStatus({ accountId: ctx.accountId, port });
      ctx.log?.info(`starting ws[${ctx.accountId}] on port ${port}`);
      return monitorWsProvider({
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        accountId: ctx.accountId,
      });
    },
  },
};
