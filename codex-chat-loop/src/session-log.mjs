import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { codexSessionsDir } from "./paths.mjs";

const SESSION_CACHE_MS = 5_000;
let cachedFiles = null;
let cachedAt = 0;

async function walk(dir, files) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  await Promise.all(entries.map(async (entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(target, files);
    if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(target);
  }));
}

async function sessionFiles() {
  if (cachedFiles && Date.now() - cachedAt < SESSION_CACHE_MS) return cachedFiles;
  const files = [];
  await walk(codexSessionsDir, files);
  const stats = await Promise.all(files.map(async (file) => ({ file, stat: await fs.stat(file) })));
  cachedFiles = stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  cachedAt = Date.now();
  return cachedFiles;
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function firstEvent(file) {
  const handle = await fs.open(file, "r");
  try {
    const buffer = Buffer.alloc(65_536);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return parseLine(buffer.toString("utf8", 0, bytesRead).split("\n")[0]);
  } finally {
    await handle.close();
  }
}

export async function listSessions(limit = 150) {
  const files = await sessionFiles();
  const result = [];
  const ids = new Set();
  for (const { file, stat } of files) {
    const first = await firstEvent(file);
    const id = first?.payload?.session_id;
    if (typeof id !== "string" || ids.has(id)) continue;
    ids.add(id);
    result.push({
      id,
      cwd: first.payload.cwd,
      source: first.payload.source,
      updatedAt: stat.mtime.toISOString(),
    });
    if (result.length === limit) break;
  }
  return result;
}

function validSessionId(sessionId) {
  if (!/^[a-zA-Z0-9-]{8,}$/.test(sessionId)) throw new Error("invalid Codex session id");
}

export async function findSessionFile(sessionId) {
  validSessionId(sessionId);
  const files = await sessionFiles();
  for (const { file } of files) {
    if (!path.basename(file).includes(sessionId)) continue;
    const first = await firstEvent(file);
    if (first?.payload?.session_id === sessionId) return file;
  }
  throw new Error(`Codex session ${sessionId} was not found`);
}

export async function readSessionMeta(sessionId) {
  const file = await findSessionFile(sessionId);
  const first = await firstEvent(file);
  const cwd = first?.payload?.cwd;
  if (typeof cwd !== "string" || !cwd) throw new Error(`Codex session ${sessionId} has no working directory`);
  return { id: sessionId, cwd, source: first.payload.source, file };
}

export async function readLastAgentMessage(sessionId) {
  const file = await findSessionFile(sessionId);
  const input = (await fs.open(file, "r")).createReadStream();
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let last = null;
  for await (const line of lines) {
    const event = parseLine(line);
    if (event?.type === "event_msg" && event.payload?.type === "agent_message") {
      const message = event.payload.message?.trim();
      if (message) last = message;
    }
  }
  if (!last) throw new Error(`Codex session ${sessionId} has no completed agent message`);
  return last;
}
