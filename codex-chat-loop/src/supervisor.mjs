import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { appendEvent, createProject, initializeStore, listRecentEvents, writeConfig } from "./store.mjs";
import { runsDir } from "./paths.mjs";
import { buildChatGptRequest, parseChatGptReply } from "./protocol.mjs";
import { listSessions, readLastAgentMessage, readSessionMeta } from "./session-log.mjs";

const MAX_BODY_BYTES = 64_000;
const MAX_CODEX_OUTPUT_BYTES = 240_000;
const MAX_ERROR_CHARS = 2_000;
const MAX_EVENT_DIAGNOSTIC_CHARS = 4_000;
const ACTION_LEASE_MS = 10 * 60_000;
const ACTION_HISTORY_LIMIT = 100;
const KILL_GRACE_MS = 5_000;

function now() {
  return new Date().toISOString();
}

function safeError(error, max = MAX_EVENT_DIAGNOSTIC_CHARS) {
  return (error instanceof Error ? error.message : String(error)).slice(0, max);
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertString(value, label, max = 20_000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${label} must be a non-empty string up to ${max} characters`);
  }
  return value.trim();
}

function assertOptionalInteger(value, label) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value;
}

function conversationDescriptor(value) {
  const url = new URL(assertString(value, "chatUrl"));
  if (url.protocol !== "https:" || !["chatgpt.com", "chat.openai.com"].includes(url.hostname) || url.username || url.password) {
    throw new Error("chatUrl must be an HTTPS ChatGPT conversation URL");
  }
  const pathname = url.pathname.replace(/\/+$/, "");
  if (!/^\/c\/[A-Za-z0-9-]+$/.test(pathname)) {
    throw new Error("chatUrl must be a canonical ChatGPT /c/<conversation-id> URL");
  }
  return {
    chatUrl: `${url.origin}${pathname}`,
    conversationKey: `${url.origin}${pathname}`,
  };
}

function redactSecrets(value) {
  const patterns = [
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g,
    /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
  ];
  let redactions = 0;
  let text = value;
  for (const pattern of patterns) {
    text = text.replace(pattern, () => {
      redactions += 1;
      return "[REDACTED_SENSITIVE_VALUE]";
    });
  }
  return { text, redactions };
}

function promptPolicyError(prompt) {
  const prohibited = [
    /--dangerously-bypass-approvals-and-sandbox/i,
    /--approve-for-me/i,
    /--dangerously-bypass-hook-trust/i,
    /--sandbox\s+danger-full-access/i,
    /(?:enable|use|set)\b[^\n]{0,80}\b(?:danger-full-access|approval bypass|sandbox bypass)/i,
    /(?:edit|modify|change)\b[^\n]{0,80}\b(?:codex config|config\.toml|approval policy|sandbox policy)/i,
    /ignore (?:all |the )?(?:sandbox|approval|security|safety) (?:policy|policies|rules|guardrails)/i,
    /disable (?:all |the )?(?:sandbox|approval|security|safety) (?:policy|policies|rules|guardrails)/i,
  ];
  return prohibited.find((pattern) => pattern.test(prompt))
    ? "next Codex prompt requests a prohibited safety-policy bypass"
    : null;
}

function publicProject(project) {
  const {
    lastCodexOutput,
    lastChatGptReply,
    pendingPrompt,
    pendingPromptHash,
    ...safe
  } = project;
  return {
    ...safe,
    hasCurrentCompletion: Boolean(lastCodexOutput),
    hasPendingPrompt: Boolean(pendingPrompt),
    pendingPromptPreview: pendingPrompt ? `${pendingPrompt.slice(0, 320)}${pendingPrompt.length > 320 ? "…" : ""}` : null,
    estimatedRemoteTokens: Math.ceil((safe.remoteCharsSent || 0) / 4),
    estimatedPromptTokens: Math.ceil((safe.promptCharsReceived || 0) / 4),
  };
}

function publicAction(action) {
  return {
    id: action.id,
    projectId: action.projectId,
    type: action.type,
    createdAt: action.createdAt,
    claimedAt: action.claimedAt,
    attempt: action.attempt,
  };
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("request body must be JSON");
  }
}

function writeJson(response, status, value, origin) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function notification(summary, body) {
  const child = spawn("notify-send", [summary, body], { stdio: "ignore", detached: true });
  child.once("error", () => {});
  child.unref();
}

function terminateChild(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try { child.kill(signal); } catch {}
  }
}

async function waitForChild(child, maxRunMs, run) {
  let timedOut = false;
  let forced = false;
  let timer;
  let killTimer;
  let rejectHardTimeout;
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const hardTimeout = new Promise((_, reject) => { rejectHardTimeout = reject; });
  timer = setTimeout(() => {
    timedOut = true;
    terminateChild(child, "SIGTERM");
    killTimer = setTimeout(() => {
      forced = true;
      terminateChild(child, "SIGKILL");
      rejectHardTimeout(new Error(`Codex exceeded the ${Math.round(maxRunMs / 60_000)} minute execution limit`));
    }, KILL_GRACE_MS);
  }, maxRunMs);
  try {
    const result = await Promise.race([closed, hardTimeout]);
    if (timedOut) throw new Error(`Codex exceeded the ${Math.round(maxRunMs / 60_000)} minute execution limit${forced ? " and required SIGKILL" : ""}`);
    if (run.cancelled) throw new Error("Codex run was cancelled");
    return result;
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
  }
}

function observeJsonLines(stream) {
  let buffer = "";
  const eventTypes = new Map();
  const itemTypes = new Map();
  const increment = (map, value) => {
    if (typeof value !== "string" || map.size > 40) return;
    map.set(value, (map.get(value) || 0) + 1);
  };
  const parse = (line) => {
    try {
      const event = JSON.parse(line);
      increment(eventTypes, event.type);
      increment(itemTypes, event.item?.type || event.payload?.item?.type);
    } catch {
      increment(eventTypes, "invalid_jsonl");
    }
  };
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer = `${buffer}${chunk}`;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
    if (buffer.length > 64_000) {
      increment(eventTypes, "oversized_jsonl_line");
      buffer = "";
    }
  });
  return () => {
    if (buffer.trim()) parse(buffer);
    return {
      events: Object.fromEntries(eventTypes),
      items: Object.fromEntries(itemTypes),
    };
  };
}

export class Supervisor {
  constructor(config) {
    this.config = config;
    this.actions = new Map((config.actions || []).map((action) => [action.id, action]));
    this.running = new Map();
    this.runningSessions = new Map();
  }

  syncActions() {
    this.config.actions = [...this.actions.values()];
  }

  async save() {
    this.syncActions();
    await writeConfig(this.config);
  }

  restore(snapshot, actions) {
    for (const key of Object.keys(this.config)) delete this.config[key];
    Object.assign(this.config, snapshot);
    this.actions = actions;
  }

  async record(event) {
    try {
      await appendEvent(event);
    } catch (error) {
      process.stderr.write(`${JSON.stringify({ at: now(), type: "event_write_failed", reason: safeError(error) })}\n`);
    }
  }

  async change(event, apply) {
    const snapshot = structuredClone(this.config);
    const actions = new Map(this.actions);
    try {
      apply();
      await this.save();
    } catch (error) {
      this.restore(snapshot, actions);
      throw error;
    }
    await this.record(event);
  }

  project(id) {
    const project = this.config.projects.find((candidate) => candidate.id === id);
    if (!project) throw new Error("project not found");
    return project;
  }

  actionForProject(projectId) {
    return [...this.actions.values()].find((action) => action.projectId === projectId) || null;
  }

  ensureSessionAvailable(project) {
    const holder = this.runningSessions.get(project.sessionId);
    if (holder && holder !== project.id) throw new Error("Codex is already running for this persisted session");
    const recoveredRun = this.config.projects.find((candidate) => candidate.sessionId === project.sessionId && candidate.activeRun);
    if (recoveredRun) throw new Error("a prior Codex process may still be active for this persisted session; acknowledge its recovery state first");
  }

  buildAction(project) {
    if (!project.conversationKey) throw new Error("mapped ChatGPT URL is no longer a canonical conversation; remove and recreate this workstream");
    if (!project.lastCodexOutput) throw new Error("there is no Codex completion to send");
    if (Buffer.byteLength(project.lastCodexOutput, "utf8") > MAX_CODEX_OUTPUT_BYTES) {
      throw new Error("Codex completion exceeds the safe handoff size; review it manually");
    }
    if (project.rounds >= project.limits.maxRounds) throw new Error(`workstream reached its ${project.limits.maxRounds}-round limit`);
    const { text, redactions } = redactSecrets(project.lastCodexOutput);
    const message = buildChatGptRequest(text);
    if (project.remoteCharsSent + message.length > project.limits.maxRemoteChars) {
      throw new Error("workstream reached its remote-transcript character budget");
    }
    return {
      id: crypto.randomUUID(),
      projectId: project.id,
      type: "chatgpt_turn",
      chatUrl: project.chatUrl,
      conversationKey: project.conversationKey,
      tabId: project.tabId,
      message,
      createdAt: now(),
      claimedBy: null,
      claimedAt: null,
      attempt: 0,
      redactions,
    };
  }

  queueChatGptInMemory(project) {
    const existing = this.actionForProject(project.id);
    if (existing) return existing;
    const action = this.buildAction(project);
    project.status = "waiting_chatgpt";
    project.pauseReason = null;
    project.updatedAt = now();
    project.remoteCharsSent += action.message.length;
    this.actions.set(action.id, action);
    return action;
  }

  async addProject(input) {
    const requestedCwd = path.resolve(assertString(input.cwd, "cwd"));
    const [cwd, sessionId] = await Promise.all([fs.realpath(requestedCwd), Promise.resolve(assertString(input.sessionId, "sessionId", 200))]);
    const stat = await fs.stat(cwd);
    if (!stat.isDirectory()) throw new Error("cwd must be a directory");
    const session = await readSessionMeta(sessionId).catch((error) => {
      throw new Error(`unable to read selected Codex session: ${safeError(error)}`);
    });
    const sessionCwd = await fs.realpath(session.cwd).catch(() => {
      throw new Error("selected Codex session working directory no longer exists");
    });
    if (sessionCwd !== cwd) throw new Error("cwd must match the selected Codex session working directory");
    await readLastAgentMessage(sessionId).catch((error) => {
      throw new Error(`selected Codex session has no completed agent message: ${safeError(error)}`);
    });
    const descriptor = conversationDescriptor(input.chatUrl);
    const tabId = assertOptionalInteger(input.tabId, "tabId");
    if (this.config.projects.some((project) => project.sessionId === sessionId)) {
      throw new Error("this Codex session is already mapped to a workstream");
    }
    if (this.config.projects.some((project) => project.conversationKey === descriptor.conversationKey)) {
      throw new Error("this ChatGPT conversation is already mapped to a workstream");
    }
    const project = createProject({
      name: assertString(input.name, "name", 120),
      cwd,
      sessionId,
      ...descriptor,
      tabId,
      autonomous: input.autonomous === true,
      retainTranscripts: input.retainTranscripts === true,
    });
    await this.change({ type: "project_created", projectId: project.id, name: project.name, autonomous: project.autonomous }, () => {
      this.config.projects.push(project);
    });
    return publicProject(project);
  }

  async adopt(id) {
    const project = this.project(id);
    if (this.running.has(id)) throw new Error("Codex is currently running for this project");
    this.ensureSessionAvailable(project);
    if (this.actionForProject(id)) throw new Error("a browser handoff is already pending for this project");
    const completion = await readLastAgentMessage(project.sessionId);
    await this.change({ type: "project_adopted", projectId: id }, () => {
      project.lastCodexOutput = completion;
      project.lastCompletionHash = hash(completion);
      project.status = "awaiting_handoff_review";
      project.pauseReason = "latest Codex completion is waiting for review before browser submission";
      project.updatedAt = now();
    });
    return publicProject(project);
  }

  async sendCurrent(id, eventType = "handoff_sent") {
    const project = this.project(id);
    if (this.running.has(id)) throw new Error("Codex is currently running for this project");
    this.ensureSessionAvailable(project);
    if (this.actionForProject(id)) throw new Error("a browser handoff is already pending for this project");
    await this.change({ type: eventType, projectId: id }, () => {
      this.queueChatGptInMemory(project);
    });
    return publicProject(project);
  }

  async pause(id, reason = "paused from dashboard") {
    const project = this.project(id);
    if (this.running.has(id)) throw new Error("Codex is running; use cancel to terminate the active turn");
    await this.change({ type: "project_paused", projectId: id, reason }, () => {
      for (const [actionId, action] of this.actions) {
        if (action.projectId === id) this.actions.delete(actionId);
      }
      project.status = "paused";
      project.pauseReason = reason;
      project.updatedAt = now();
    });
    return publicProject(project);
  }

  async cancel(id) {
    const project = this.project(id);
    const run = this.running.get(id);
    if (!run) return this.pause(id, "cancelled from dashboard");
    run.cancelled = true;
    terminateChild(run.child, "SIGTERM");
    await this.change({ type: "codex_cancel_requested", projectId: id, runId: run.id }, () => {
      project.pauseReason = "cancellation requested; waiting for Codex to exit";
      project.updatedAt = now();
    });
    return publicProject(project);
  }

  async acknowledgeRecoveredRun(id) {
    const project = this.project(id);
    if (project.status !== "paused" || !project.activeRun) {
      throw new Error("there is no recovered Codex run to acknowledge");
    }
    await this.change({ type: "recovered_run_acknowledged", projectId: id, runId: project.activeRun.id }, () => {
      project.activeRun = null;
      project.pauseReason = "recovered Codex run acknowledged as stopped; review before resuming";
      project.updatedAt = now();
    });
    return publicProject(project);
  }

  async remove(id) {
    const project = this.project(id);
    if (this.running.has(id)) throw new Error("Codex is running; cancel it before removing this workstream");
    if (project.activeRun) throw new Error("a prior Codex process may still be active; acknowledge its recovery state before removing this workstream");
    await this.change({ type: "project_removed", projectId: id }, () => {
      this.config.projects = this.config.projects.filter((project) => project.id !== id);
      for (const [actionId, action] of this.actions) {
        if (action.projectId === id) this.actions.delete(actionId);
      }
    });
  }

  async claimAction(clientId) {
    const nowMs = Date.now();
    let selected = null;
    let released = [];
    for (const action of this.actions.values()) {
      if (action.claimedBy && nowMs - action.claimedAt > ACTION_LEASE_MS) released.push(action.id);
      if (!selected && (!action.claimedBy || nowMs - action.claimedAt > ACTION_LEASE_MS)) selected = action;
    }
    if (!selected && released.length === 0) return null;
    await this.change({ type: "browser_action_claimed", actionId: selected?.id || null, releasedActionIds: released }, () => {
      for (const actionId of released) {
        const action = this.actions.get(actionId);
        if (action) {
          action.claimedBy = null;
          action.claimedAt = null;
        }
      }
      if (selected) {
        selected.claimedBy = clientId;
        selected.claimedAt = nowMs;
        selected.attempt += 1;
      }
    });
    return selected;
  }

  rememberCompletedAction(action, outcome) {
    const entries = this.config.completedActions || [];
    entries.push({ id: action.id, completedAt: now(), outcome });
    this.config.completedActions = entries.slice(-ACTION_HISTORY_LIMIT);
  }

  async pauseAfterBrowserFailure(action, reason) {
    const project = this.project(action.projectId);
    await this.change({ type: "browser_handoff_failed", projectId: project.id, actionId: action.id, reason }, () => {
      this.actions.delete(action.id);
      this.rememberCompletedAction(action, "paused");
      project.status = "paused";
      project.pauseReason = reason;
      project.updatedAt = now();
    });
    notification(`Codex chat loop: ${project.name}`, reason);
  }

  async receiveBrowserResult(actionId, input) {
    if ((this.config.completedActions || []).some((action) => action.id === actionId)) return { idempotent: true };
    const action = this.actions.get(actionId);
    if (!action) throw new Error("action not found or has already completed");
    if (action.claimedBy !== assertString(input.clientId, "clientId", 200)) {
      throw new Error("action belongs to another extension client");
    }
    const tabId = assertOptionalInteger(input.tabId, "tabId");
    if (input.conversationKey !== action.conversationKey) {
      await this.pauseAfterBrowserFailure(action, "browser reported a reply from a different ChatGPT conversation");
      return { paused: true };
    }
    if (input.error) {
      let reason;
      try {
        reason = `ChatGPT browser handoff failed: ${assertString(input.error, "error", MAX_ERROR_CHARS)}`;
      } catch (error) {
        reason = `ChatGPT browser handoff failed: invalid extension error (${safeError(error)})`;
      }
      await this.pauseAfterBrowserFailure(action, reason);
      return { paused: true };
    }
    const project = this.project(action.projectId);
    let reply;
    let parsed;
    try {
      reply = assertString(input.reply, "reply", project.limits.maxPromptChars);
      parsed = parseChatGptReply(reply);
      if (parsed.kind === "prompt") {
        const policyError = promptPolicyError(parsed.value);
        if (policyError) throw new Error(policyError);
      }
    } catch (error) {
      await this.pauseAfterBrowserFailure(action, `ChatGPT reply rejected: ${safeError(error)}`);
      return { paused: true };
    }
    let shouldRun = false;
    let prompt = null;
    await this.change({ type: parsed.kind === "done" ? "workflow_done" : "chatgpt_prompt_received", projectId: project.id, actionId: action.id }, () => {
      this.actions.delete(action.id);
      this.rememberCompletedAction(action, parsed.kind);
      if (tabId !== null) project.tabId = tabId;
      project.lastCodexOutput = project.retainTranscripts ? project.lastCodexOutput : null;
      project.lastChatGptReply = project.retainTranscripts ? reply : null;
      project.updatedAt = now();
      if (parsed.kind === "done") {
        project.pendingPrompt = null;
        project.pendingPromptHash = null;
        project.status = "completed";
        project.pauseReason = parsed.value;
        return;
      }
      project.promptCharsReceived += parsed.value.length;
      project.pendingPrompt = parsed.value;
      project.pendingPromptHash = hash(parsed.value);
      if (project.pendingPromptHash === project.lastPromptHash) {
        project.status = "paused";
        project.pauseReason = "repeated next prompt detected; review the workstream before continuing";
        return;
      }
      if (project.autonomous) {
        this.ensureSessionAvailable(project);
        project.status = "running_codex";
        project.pauseReason = null;
        shouldRun = true;
        prompt = parsed.value;
      } else {
        project.status = "awaiting_approval";
        project.pauseReason = "next Codex prompt is waiting for dashboard review";
      }
    });
    if (parsed.kind === "done") {
      notification(`Codex chat loop: ${project.name}`, "ChatGPT marked this workstream complete.");
      return { completed: true };
    }
    if (project.status === "paused") {
      notification(`Codex chat loop: ${project.name}`, project.pauseReason);
      return { paused: true };
    }
    if (shouldRun) await this.runCodex(project, prompt);
    return { awaitingApproval: !shouldRun };
  }

  async approve(id) {
    const project = this.project(id);
    if (project.status !== "awaiting_approval" || !project.pendingPrompt) {
      throw new Error("there is no reviewed Codex prompt waiting for approval");
    }
    this.ensureSessionAvailable(project);
    const prompt = project.pendingPrompt;
    await this.change({ type: "codex_prompt_approved", projectId: id }, () => {
      project.status = "running_codex";
      project.pauseReason = null;
      project.updatedAt = now();
    });
    await this.runCodex(project, prompt);
    return publicProject(project);
  }

  async runCodex(project, prompt) {
    this.ensureSessionAvailable(project);
    const policyError = promptPolicyError(prompt);
    if (policyError) throw new Error(policyError);
    const run = { id: crypto.randomUUID(), child: null, cancelled: false, startedAt: Date.now() };
    this.running.set(project.id, run);
    this.runningSessions.set(project.sessionId, project.id);
    let result;
    try {
      result = await this.executeCodex(project, prompt, run);
      if (run.cancelled) throw new Error("Codex run was cancelled");
      if (!result.completion) throw new Error("Codex completed without a final message");
      const completionHash = hash(result.completion);
      if (completionHash === project.lastCompletionHash) {
        throw new Error("Codex produced the same final completion as the previous round; review before retrying");
      }
      await this.change({
        type: "codex_turn_complete",
        projectId: project.id,
        runId: run.id,
        durationMs: result.durationMs,
        eventSummary: result.eventSummary,
      }, () => {
        project.lastCodexOutput = result.completion;
        project.lastCompletionHash = completionHash;
        project.lastPromptHash = hash(prompt);
        project.pendingPrompt = null;
        project.pendingPromptHash = null;
        project.rounds += 1;
        project.lastRun = {
          id: run.id,
          startedAt: new Date(run.startedAt).toISOString(),
          completedAt: now(),
          durationMs: result.durationMs,
          eventSummary: result.eventSummary,
        };
        project.activeRun = null;
        this.queueChatGptInMemory(project);
      });
    } catch (error) {
      const reason = `Codex handoff failed: ${safeError(error)}`;
      await this.change({ type: "codex_turn_failed", projectId: project.id, runId: run.id, reason }, () => {
        if (result?.completion) {
          project.lastCodexOutput = result.completion;
          project.lastCompletionHash = hash(result.completion);
          project.lastPromptHash = hash(prompt);
          project.pendingPrompt = null;
          project.pendingPromptHash = null;
          project.rounds += 1;
        }
        project.status = "paused";
        project.pauseReason = reason;
        project.updatedAt = now();
        project.lastRun = {
          id: run.id,
          startedAt: new Date(run.startedAt).toISOString(),
          completedAt: now(),
          durationMs: Date.now() - run.startedAt,
          eventSummary: result?.eventSummary || null,
        };
        if (!run.child?.pid || run.child.exitCode !== null || run.child.signalCode !== null) project.activeRun = null;
      }).catch((saveError) => {
        process.stderr.write(`${JSON.stringify({ at: now(), type: "state_write_failed", projectId: project.id, reason: safeError(saveError) })}\n`);
      });
      notification(`Codex chat loop: ${project.name}`, reason);
    } finally {
      this.running.delete(project.id);
      this.runningSessions.delete(project.sessionId);
    }
  }

  async executeCodex(project, prompt, run) {
    await fs.mkdir(runsDir, { recursive: true, mode: 0o700 });
    await fs.chmod(runsDir, 0o700);
    const runDir = await fs.mkdtemp(path.join(runsDir, "turn-"));
    await fs.chmod(runDir, 0o700);
    const outputFile = path.join(runDir, "last-message.txt");
    await fs.writeFile(outputFile, "", { flag: "wx", mode: 0o600 });
    const startedAt = Date.now();
    let stderr = "";
    let child;
    try {
      child = spawn(process.env.CODEX_CHAT_LOOP_CODEX || "codex", [
        "exec", "resume", project.sessionId, "-", "--json", "--output-last-message", outputFile,
      ], {
        cwd: project.cwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
      run.child = child;
      try {
        await this.change({ type: "codex_run_started", projectId: project.id, runId: run.id, pid: child.pid }, () => {
          project.activeRun = { id: run.id, pid: child.pid, startedAt: new Date(startedAt).toISOString() };
        });
      } catch (error) {
        terminateChild(child, "SIGTERM");
        throw error;
      }
      const jsonSummary = observeJsonLines(child.stdout);
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-20_000); });
      child.stdin.once("error", () => {});
      child.stdin.end(prompt, "utf8");
      const { code, signal } = await waitForChild(child, project.limits.maxRunMs, run);
      const eventSummary = jsonSummary();
      if (code !== 0) {
        throw new Error(`Codex exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}: ${stderr.trim() || "no diagnostic output"}`);
      }
      const outputStat = await fs.stat(outputFile);
      if (outputStat.size > MAX_CODEX_OUTPUT_BYTES) throw new Error("Codex final message exceeds the safe handoff size");
      const completion = (await fs.readFile(outputFile, "utf8")).trim();
      return { completion, durationMs: Date.now() - startedAt, eventSummary };
    } finally {
      await fs.rm(runDir, { recursive: true, force: true }).catch((error) => this.record({
        type: "run_cleanup_failed", projectId: project.id, runId: run.id, reason: safeError(error),
      }));
    }
  }

  async shutdown() {
    const runs = [...this.running.values()];
    for (const run of runs) {
      run.cancelled = true;
      if (run.child) terminateChild(run.child, "SIGTERM");
    }
    await this.record({ type: "supervisor_shutdown", activeRuns: runs.length });
  }

  pendingPrompt(id) {
    const project = this.project(id);
    if (!project.pendingPrompt) throw new Error("there is no pending Codex prompt");
    return { projectId: project.id, prompt: project.pendingPrompt, chars: project.pendingPrompt.length };
  }

  currentCompletion(id) {
    const project = this.project(id);
    if (!project.lastCodexOutput) throw new Error("there is no current Codex completion to review");
    const { text, redactions } = redactSecrets(project.lastCodexOutput);
    return {
      projectId: project.id,
      completion: text,
      chars: text.length,
      redactions,
      estimatedTokens: Math.ceil(text.length / 4),
    };
  }

  status() {
    return {
      projects: this.config.projects.map(publicProject),
      pendingActions: this.actions.size,
      actions: [...this.actions.values()].map(publicAction),
      runningProjects: [...this.running.keys()],
      limits: { actionLeaseMs: ACTION_LEASE_MS, maxRequestBytes: MAX_BODY_BYTES },
    };
  }
}

function corsOrigin(request, config) {
  const origin = request.headers.origin;
  if (!origin?.startsWith("chrome-extension://")) return null;
  if (config.extensionOrigin && config.extensionOrigin !== origin) return null;
  return origin;
}

async function authorize(request, supervisor) {
  if (request.headers.authorization !== `Bearer ${supervisor.config.authToken}`) return false;
  const origin = request.headers.origin;
  if (origin?.startsWith("chrome-extension://") && !supervisor.config.extensionOrigin) {
    await supervisor.change({ type: "extension_origin_bound", origin }, () => {
      supervisor.config.extensionOrigin = origin;
    });
  }
  return !origin?.startsWith("chrome-extension://") || supervisor.config.extensionOrigin === origin;
}

export async function startSupervisor() {
  const config = await initializeStore();
  const supervisor = new Supervisor(config);
  let recovered = false;
  await supervisor.change({ type: "supervisor_started" }, () => {
    for (const project of config.projects) {
      if (["waiting_chatgpt", "running_codex", "awaiting_approval", "awaiting_handoff_review"].includes(project.status)) {
        project.status = "paused";
        project.pauseReason = project.activeRun
          ? `supervisor restarted; Codex PID ${project.activeRun.pid} may still be active. Confirm it has exited before resuming`
          : "supervisor restarted; review the pending work before resuming";
        project.updatedAt = now();
        recovered = true;
      }
    }
    if (config.actions.length) {
      for (const action of supervisor.actions.values()) supervisor.rememberCompletedAction(action, "recovered_paused");
      config.actions = [];
      supervisor.actions.clear();
      recovered = true;
    }
  });
  if (recovered) await supervisor.record({ type: "supervisor_recovery_paused_workstreams" });
  const server = http.createServer({ maxHeaderSize: 8_192 }, async (request, response) => {
    const origin = corsOrigin(request, supervisor.config);
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        ...(origin ? {
          "access-control-allow-origin": origin,
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
          vary: "Origin",
        } : {}),
      });
      response.end();
      return;
    }
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (!(await authorize(request, supervisor))) {
        writeJson(response, 401, { error: "unauthorized" }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/health") {
        writeJson(response, 200, { ok: true, version: 2 }, origin);
        return;
      }
      const body = ["POST", "PATCH"].includes(request.method) ? await readBody(request) : {};
      const parts = url.pathname.split("/").filter(Boolean);
      if (request.method === "GET" && url.pathname === "/v1/status") {
        writeJson(response, 200, supervisor.status(), origin);
      } else if (request.method === "GET" && url.pathname === "/v1/sessions") {
        writeJson(response, 200, { sessions: await listSessions() }, origin);
      } else if (request.method === "GET" && url.pathname === "/v1/events") {
        writeJson(response, 200, { events: await listRecentEvents(100) }, origin);
      } else if (request.method === "POST" && url.pathname === "/v1/projects") {
        writeJson(response, 201, { project: await supervisor.addProject(body) }, origin);
      } else if (parts.length === 4 && parts[0] === "v1" && parts[1] === "projects" && request.method === "POST") {
        const [, , id, operation] = parts;
        if (operation === "adopt") writeJson(response, 200, { project: await supervisor.adopt(id) }, origin);
        else if (operation === "send") writeJson(response, 200, { project: await supervisor.sendCurrent(id) }, origin);
        else if (operation === "pause") writeJson(response, 200, { project: await supervisor.pause(id) }, origin);
        else if (operation === "cancel") writeJson(response, 200, { project: await supervisor.cancel(id) }, origin);
        else if (operation === "acknowledge-recovered-run") writeJson(response, 200, { project: await supervisor.acknowledgeRecoveredRun(id) }, origin);
        else if (operation === "approve") writeJson(response, 200, { project: await supervisor.approve(id) }, origin);
        else throw new Error("unknown project operation");
      } else if (parts.length === 4 && parts[0] === "v1" && parts[1] === "projects" && parts[3] === "pending-prompt" && request.method === "GET") {
        writeJson(response, 200, supervisor.pendingPrompt(parts[2]), origin);
      } else if (parts.length === 4 && parts[0] === "v1" && parts[1] === "projects" && parts[3] === "current-completion" && request.method === "GET") {
        writeJson(response, 200, supervisor.currentCompletion(parts[2]), origin);
      } else if (parts.length === 3 && parts[0] === "v1" && parts[1] === "projects" && request.method === "DELETE") {
        await supervisor.remove(parts[2]);
        writeJson(response, 204, {}, origin);
      } else if (request.method === "POST" && url.pathname === "/v1/actions/claim") {
        const clientId = assertString(body.clientId, "clientId", 200);
        writeJson(response, 200, { action: await supervisor.claimAction(clientId) }, origin);
      } else if (parts.length === 4 && parts[0] === "v1" && parts[1] === "actions" && parts[3] === "result" && request.method === "POST") {
        await supervisor.receiveBrowserResult(parts[2], body);
        writeJson(response, 204, {}, origin);
      } else {
        writeJson(response, 404, { error: "not found" }, origin);
      }
    } catch (error) {
      const message = safeError(error);
      const status = message.includes("not found") ? 404 : message.includes("already") || message.includes("running") ? 409 : 400;
      writeJson(response, status, { error: message }, origin);
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.once("error", (error) => {
    process.stderr.write(`${JSON.stringify({ at: now(), type: "server_error", reason: safeError(error) })}\n`);
  });
  const stop = async () => {
    await supervisor.shutdown();
    server.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  server.listen(supervisor.config.port, "127.0.0.1", () => {
    process.stdout.write(`codex-chat-loop supervisor listening on http://127.0.0.1:${supervisor.config.port}\n`);
  });
  return { server, supervisor };
}
