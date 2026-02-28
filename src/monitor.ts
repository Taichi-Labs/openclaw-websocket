import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { WsChatServer, setWsServer } from "./websocket-server.js";
import { handleWsMessage } from "./bot.js";
import { WsConfigSchema, type WsConfig } from "./types.js";

export interface MonitorWsOptions {
  config: ClawdbotConfig;
  runtime: RuntimeEnv;
  abortSignal?: AbortSignal;
  accountId?: string;
}

function resolveWsConfig(cfg: ClawdbotConfig, accountId?: string): WsConfig {
  const channelsCfg = cfg.channels as Record<string, unknown> | undefined;
  const wsCfg = channelsCfg?.websocket as Record<string, unknown> | undefined;
  
  const authCfg = wsCfg?.auth as Record<string, unknown> | undefined;

  const envAuthEnabled = process.env.WS_AUTH_ENABLED;
  const envAuthEndpoint = process.env.WS_AUTH_ENDPOINT;

  const resolvedAuth = {
    ...(authCfg ?? {}),
    ...(envAuthEnabled !== undefined
      ? { enabled: envAuthEnabled === "true" || envAuthEnabled === "1" }
      : {}),
    ...(envAuthEndpoint ? { endpoint: envAuthEndpoint } : {}),
  };

  const rawConfig = {
    enabled: wsCfg?.enabled ?? true,
    port: wsCfg?.port ?? 18800,
    host: wsCfg?.host ?? "0.0.0.0",
    path: wsCfg?.path ?? "/ws",
    dmPolicy: wsCfg?.dmPolicy ?? "open",
    allowFrom: wsCfg?.allowFrom ?? [],
    auth: resolvedAuth,
    dynamicAgentCreation: (wsCfg?.dynamicAgentCreation as Record<string, unknown>) ?? {},
  };

  return WsConfigSchema.parse(rawConfig);
}

export async function monitorWsProvider(options: MonitorWsOptions): Promise<void> {
  const { config, runtime, abortSignal, accountId = "default" } = options;
  const log = runtime.log ?? console.log;

  const wsConfig = resolveWsConfig(config, accountId);

  log(`websocket[${accountId}]: resolved config:`);
  log(`  enabled: ${wsConfig.enabled}`);
  log(`  listen: ${wsConfig.host}:${wsConfig.port}${wsConfig.path}`);
  log(`  auth.enabled: ${wsConfig.auth?.enabled ?? "not configured"}`);
  log(`  auth.endpoint: ${wsConfig.auth?.endpoint ?? "not configured"}`);
  log(`  auth.required: ${wsConfig.auth?.required ?? "not configured"}`);
  log(`  dynamicAgentCreation: ${wsConfig.dynamicAgentCreation?.enabled ?? false}`);

  if (!wsConfig.enabled) {
    log(`websocket[${accountId}]: channel disabled, skipping`);
    return;
  }

  const server = new WsChatServer({
    config: wsConfig,
    log,
    onMessage: async (ctx, send) => {
      await handleWsMessage({
        cfg: config,
        wsConfig,
        ctx,
        send,
        accountId,
      });
    },
  });

  setWsServer(server);

  await server.start();

  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      log(`websocket[${accountId}]: received abort signal, stopping server`);
      server.stop();
      setWsServer(null);
    });
  }

  await new Promise<void>((resolve) => {
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => resolve());
    }
  });
}
