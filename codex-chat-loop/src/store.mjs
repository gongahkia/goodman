import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { appConfigDir, appStateDir, configPath, eventsPath } from "./paths.mjs";

const blankConfig = () => ({
  version: 2,
  port: 41671,
  authToken: crypto.randomBytes(32).toString("base64url"),
  extensionOrigin: null,
  projects: [],
  actions: [],
  completedActions: [],
});

export const DEFAULT_LIMITS = Object.freeze({
  maxRounds: 12,
  maxRemoteChars: 120_000,
  maxPromptChars: 12_000,
  maxRunMs: 20 * 60_000,
});

const EVENT_ROTATE_BYTES = 5 * 1024 * 1024;

function asPositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function asNonNegativeInteger(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function legacyConversationKey(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/+$/, "");
    return /^\/c\/[A-Za-z0-9-]+$/.test(pathname) ? `${url.origin}${pathname}` : null;
  } catch {
    return null;
  }
}

function normalizeProject(project) {
  return {
    ...project,
    tabId: Number.isInteger(project.tabId) ? project.tabId : null,
    conversationKey: typeof project.conversationKey === "string" ? project.conversationKey : legacyConversationKey(project.chatUrl),
    autonomous: project.autonomous === true,
    retainTranscripts: project.retainTranscripts === true,
    limits: {
      maxRounds: asPositiveInteger(project.limits?.maxRounds, DEFAULT_LIMITS.maxRounds),
      maxRemoteChars: asPositiveInteger(project.limits?.maxRemoteChars, DEFAULT_LIMITS.maxRemoteChars),
      maxPromptChars: asPositiveInteger(project.limits?.maxPromptChars, DEFAULT_LIMITS.maxPromptChars),
      maxRunMs: asPositiveInteger(project.limits?.maxRunMs, DEFAULT_LIMITS.maxRunMs),
    },
    remoteCharsSent: asNonNegativeInteger(project.remoteCharsSent),
    promptCharsReceived: asNonNegativeInteger(project.promptCharsReceived),
    pendingPrompt: typeof project.pendingPrompt === "string" ? project.pendingPrompt : null,
    pendingPromptHash: typeof project.pendingPromptHash === "string" ? project.pendingPromptHash : null,
    lastPromptHash: typeof project.lastPromptHash === "string" ? project.lastPromptHash : null,
    lastCompletionHash: typeof project.lastCompletionHash === "string" ? project.lastCompletionHash : null,
    lastRun: project.lastRun && typeof project.lastRun === "object" ? project.lastRun : null,
    activeRun: project.activeRun && typeof project.activeRun === "object" ? project.activeRun : null,
    lastCodexOutput: typeof project.lastCodexOutput === "string" ? project.lastCodexOutput : null,
    lastChatGptReply: typeof project.lastChatGptReply === "string" ? project.lastChatGptReply : null,
  };
}

function migrateConfig(config) {
  if (config.version === 1) {
    return {
      ...config,
      version: 2,
      extensionOrigin: null,
      actions: [],
      completedActions: [],
      projects: config.projects.map(normalizeProject),
    };
  }
  if (config.version === 2) {
    return {
      ...config,
      extensionOrigin: typeof config.extensionOrigin === "string" ? config.extensionOrigin : null,
      actions: Array.isArray(config.actions) ? config.actions : [],
      completedActions: Array.isArray(config.completedActions) ? config.completedActions : [],
      projects: config.projects.map(normalizeProject),
    };
  }
  throw new Error(`invalid configuration version: ${configPath}`);
}

function validateConfig(config) {
  const statuses = new Set(["paused", "awaiting_handoff_review", "waiting_chatgpt", "awaiting_approval", "running_codex", "completed"]);
  for (const project of config.projects) {
    if (!project || typeof project !== "object" || typeof project.id !== "string" || typeof project.name !== "string"
      || typeof project.cwd !== "string" || typeof project.sessionId !== "string" || typeof project.chatUrl !== "string"
      || !statuses.has(project.status)) {
      throw new Error(`invalid project configuration: ${configPath}`);
    }
  }
  for (const action of config.actions) {
    if (!action || typeof action !== "object" || typeof action.id !== "string" || typeof action.projectId !== "string"
      || action.type !== "chatgpt_turn" || typeof action.message !== "string" || action.message.length > 128_000
      || (action.claimedBy !== null && typeof action.claimedBy !== "string")
      || (action.claimedAt !== null && !Number.isInteger(action.claimedAt))) {
      throw new Error(`invalid pending action configuration: ${configPath}`);
    }
  }
}

export async function initializeStore() {
  await fs.mkdir(appConfigDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(appStateDir, { recursive: true, mode: 0o700 });
  await fs.chmod(appConfigDir, 0o700);
  await fs.chmod(appStateDir, 0o700);
  try {
    await fs.access(configPath);
  } catch {
    await writeConfig(blankConfig());
  }
  const config = await readConfig();
  const persistedVersion = JSON.parse(await fs.readFile(configPath, "utf8")).version;
  if (persistedVersion !== 2) await writeConfig(config);
  return config;
}

export async function readConfig() {
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.projects) || typeof parsed.authToken !== "string" || parsed.authToken.length < 32) {
    throw new Error(`invalid configuration: ${configPath}`);
  }
  const config = migrateConfig(parsed);
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535) {
    throw new Error(`invalid configuration port: ${configPath}`);
  }
  validateConfig(config);
  return config;
}

export async function writeConfig(config) {
  const temporary = `${configPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, configPath);
  await fs.chmod(configPath, 0o600);
}

export async function appendEvent(event) {
  await fs.mkdir(path.dirname(eventsPath), { recursive: true, mode: 0o700 });
  await fs.chmod(path.dirname(eventsPath), 0o700);
  try {
    const stat = await fs.stat(eventsPath);
    if (stat.size >= EVENT_ROTATE_BYTES) {
      const suffix = new Date().toISOString().replace(/[:.]/g, "-");
      await fs.rename(eventsPath, `${eventsPath}.${suffix}.jsonl`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await fs.appendFile(eventsPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, {
    mode: 0o600,
  });
}

export async function listRecentEvents(limit = 100) {
  const handle = await fs.open(eventsPath, "r").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!handle) return [];
  try {
    const stat = await handle.stat();
    const size = Math.min(stat.size, 256 * 1024);
    const buffer = Buffer.alloc(size);
    await handle.read(buffer, 0, size, stat.size - size);
    return buffer.toString("utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } finally {
    await handle.close();
  }
}

export function createProject(input) {
  return {
    id: crypto.randomUUID(),
    name: input.name,
    cwd: input.cwd,
    sessionId: input.sessionId,
    chatUrl: input.chatUrl,
    tabId: Number.isInteger(input.tabId) ? input.tabId : null,
    conversationKey: input.conversationKey,
    autonomous: input.autonomous === true,
    retainTranscripts: input.retainTranscripts === true,
    limits: { ...DEFAULT_LIMITS },
    status: "paused",
    rounds: 0,
    remoteCharsSent: 0,
    promptCharsReceived: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastCodexOutput: null,
    lastChatGptReply: null,
    pendingPrompt: null,
    pendingPromptHash: null,
    lastPromptHash: null,
    lastCompletionHash: null,
    lastRun: null,
    activeRun: null,
    pauseReason: null,
  };
}
