import type { RuntimeEnv } from "openclaw/plugin-sdk";

let wsRuntime: RuntimeEnv | null = null;

export function setWsRuntime(runtime: RuntimeEnv): void {
  wsRuntime = runtime;
}

export function getWsRuntime(): RuntimeEnv {
  if (!wsRuntime) {
    throw new Error("WebSocket runtime not initialized. Make sure the plugin is registered.");
  }
  return wsRuntime;
}
