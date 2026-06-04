import type { PluginRuntime } from "openclaw/plugin-sdk";

let wsRuntime: PluginRuntime | null = null;

export function setWsRuntime(runtime: PluginRuntime): void {
  wsRuntime = runtime;
}

export function getWsRuntime(): PluginRuntime {
  if (!wsRuntime) {
    throw new Error("WebSocket runtime not initialized. Make sure the plugin is registered.");
  }
  return wsRuntime;
}
