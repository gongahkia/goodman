import os from "node:os";
import path from "node:path";

const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
const xdgState = process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");

export const appConfigDir = path.join(xdgConfig, "codex-chat-loop");
export const appStateDir = path.join(xdgState, "codex-chat-loop");
export const configPath = path.join(appConfigDir, "config.json");
export const eventsPath = path.join(appStateDir, "events.jsonl");
export const runsDir = path.join(appStateDir, "runs");
export const codexSessionsDir = path.join(
  process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
  "sessions",
);
