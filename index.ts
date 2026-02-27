import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { wsPlugin } from "./src/channel.js";
import { setWsRuntime } from "./src/runtime.js";

export { monitorWsProvider } from "./src/monitor.js";
export { wsPlugin } from "./src/channel.js";
export { WsChatServer, getWsServer } from "./src/websocket-server.js";
export type { WsConfig, WsMessageContext, WsInboundMessage, WsOutboundMessage } from "./src/types.js";

const plugin = {
  id: "ws",
  name: "WebSocket",
  description: "WebSocket chat channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setWsRuntime(api.runtime);
    api.registerChannel({ plugin: wsPlugin });
  },
};

export default plugin;
