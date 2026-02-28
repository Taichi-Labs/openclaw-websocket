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

export interface UserMemoryProfile {
  userId: string;
  username: string;
  extra?: Record<string, unknown>;
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
  userProfile?: UserMemoryProfile;
  log: (msg: string) => void;
}): Promise<MaybeCreateDynamicAgentResult> {
  const { cfg, runtime, senderId, dynamicCfg, accountId, userProfile, log } = params;

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

  if (userProfile) {
    const memoryContent = buildBaseMemory(userProfile);
    const memoryFile = path.join(agentDir, "user-profile.md");
    await fs.promises.writeFile(memoryFile, memoryContent, "utf-8");
    log(`websocket: wrote base memory for ${senderId} -> ${memoryFile}`);
  }

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

function buildBaseMemory(profile: UserMemoryProfile): string {
  const lines: string[] = [
    `# 用户基础信息`,
    ``,
    `- 用户ID: ${profile.userId}`,
    `- 用户名: ${profile.username}`,
  ];

  const extra = profile.extra;
  if (!extra) return lines.join("\n") + "\n";

  if (extra.position) {
    lines.push(`- 岗位: ${extra.position}`);
  }
  if (extra.role) {
    lines.push(`- 角色: ${extra.role}`);
  }

  const stores = extra.stores as Array<Record<string, string>> | undefined;
  if (stores && stores.length > 0) {
    lines.push(``, `## 所属门店`);
    for (const s of stores) {
      lines.push(`- ${s.storeName ?? s.storeId}（编号: ${s.storeId}，城市: ${s.city ?? "未知"}）`);
    }
  }

  const warehouses = extra.warehouses as Array<Record<string, string>> | undefined;
  if (warehouses && warehouses.length > 0) {
    lines.push(``, `## 所属仓库`);
    for (const w of warehouses) {
      lines.push(`- ${w.warehouseName ?? w.warehouseId}（编号: ${w.warehouseId}）`);
    }
  }

  // 其余扩展字段
  const knownKeys = new Set(["role", "position", "stores", "warehouses"]);
  for (const [key, value] of Object.entries(extra)) {
    if (knownKeys.has(key)) continue;
    lines.push(`- ${key}: ${JSON.stringify(value)}`);
  }

  return lines.join("\n") + "\n";
}
