import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";

export interface DynamicAgentCreationConfig {
  enabled?: boolean;
  workspaceTemplate?: string;
  agentDirTemplate?: string;
  maxAgents?: number;
}

export type MaybeCreateDynamicAgentResult = {
  created: boolean;
  updatedCfg: OpenClawConfig;
  agentId?: string;
};

export async function maybeCreateDynamicAgent(params: {
  cfg: OpenClawConfig;
  runtime: PluginRuntime;
  senderId: string;
  dynamicCfg: DynamicAgentCreationConfig;
  accountId?: string;
  log: (msg: string) => void;
}): Promise<MaybeCreateDynamicAgentResult> {
  const { cfg, runtime, senderId, dynamicCfg, accountId, log } = params;

  const existingBindings = cfg.bindings ?? [];
  const hasBinding = existingBindings.some(
    (b) =>
      b.match?.channel === "websocket" &&
      (!accountId || b.match?.accountId === accountId) &&
      b.match?.peer?.kind === "direct" &&
      b.match?.peer?.id === senderId,
  );

  if (hasBinding) {
    return { created: false, updatedCfg: cfg };
  }

  if (dynamicCfg.maxAgents !== undefined) {
    const wsAgentCount = (cfg.agents?.list ?? []).filter((a) =>
      a.id.startsWith("ws-"),
    ).length;
    if (wsAgentCount >= dynamicCfg.maxAgents) {
      log(`websocket: maxAgents limit (${dynamicCfg.maxAgents}) reached, skipping ${senderId}`);
      return { created: false, updatedCfg: cfg };
    }
  }

  const agentId = `ws-${senderId}`;

  const existingAgent = (cfg.agents?.list ?? []).find((a) => a.id === agentId);
  if (existingAgent) {
    log(`websocket: agent "${agentId}" exists, adding missing binding for ${senderId}`);

    const updatedCfg: OpenClawConfig = {
      ...cfg,
      bindings: [
        ...existingBindings,
        {
          agentId,
          match: {
            channel: "websocket",
            ...(accountId ? { accountId } : {}),
            peer: { kind: "direct", id: senderId },
          },
        },
      ],
    };

    await runtime.config.writeConfigFile(updatedCfg);
    return { created: true, updatedCfg, agentId };
  }

  const workspaceTemplate = dynamicCfg.workspaceTemplate ?? "~/.openclaw/workspace-{agentId}";
  const agentDirTemplate = dynamicCfg.agentDirTemplate ?? "~/.openclaw/agents/{agentId}/agent";

  const workspace = resolveUserPath(
    workspaceTemplate.replace("{userId}", senderId).replace("{agentId}", agentId),
  );
  const agentDir = resolveUserPath(
    agentDirTemplate.replace("{userId}", senderId).replace("{agentId}", agentId),
  );

  log(`websocket: creating dynamic agent "${agentId}" for user ${senderId}`);
  log(`  workspace: ${workspace}`);
  log(`  agentDir: ${agentDir}`);

  await fs.promises.mkdir(workspace, { recursive: true });
  await fs.promises.mkdir(agentDir, { recursive: true });

  const updatedCfg: OpenClawConfig = {
    ...cfg,
    agents: {
      ...cfg.agents,
      list: [...(cfg.agents?.list ?? []), { id: agentId, workspace, agentDir }],
    },
    bindings: [
      ...existingBindings,
      {
        agentId,
        match: {
          channel: "websocket",
          ...(accountId ? { accountId } : {}),
          peer: { kind: "direct", id: senderId },
        },
      },
    ],
  };

  await runtime.config.writeConfigFile(updatedCfg);
  return { created: true, updatedCfg, agentId };
}

function resolveUserPath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}
