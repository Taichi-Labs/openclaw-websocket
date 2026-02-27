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
  
  const rawConfig = {
    enabled: wsCfg?.enabled ?? true,
    port: wsCfg?.port ?? 18800,
    host: wsCfg?.host ?? "0.0.0.0",
    path: wsCfg?.path ?? "/ws",
    dmPolicy: wsCfg?.dmPolicy ?? "open",
    allowFrom: wsCfg?.allowFrom ?? [],
  };

  return WsConfigSchema.parse(rawConfig);
}

export async function monitorWsProvider(options: MonitorWsOptions): Promise<void> {
  const { config, runtime, abortSignal, accountId = "default" } = options;
  const log = runtime.log ?? console.log;

  const wsConfig = resolveWsConfig(config, accountId);

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
