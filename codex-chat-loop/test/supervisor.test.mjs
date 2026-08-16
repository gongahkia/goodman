import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function withFixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-chat-loop-test-"));
  const original = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    CODEX_HOME: process.env.CODEX_HOME,
    CODEX_CHAT_LOOP_CODEX: process.env.CODEX_CHAT_LOOP_CODEX,
  };
  try {
    process.env.XDG_CONFIG_HOME = path.join(root, "config");
    process.env.XDG_STATE_HOME = path.join(root, "state");
    process.env.CODEX_HOME = path.join(root, "codex-home");
    const bin = path.join(root, "bin");
    await fs.mkdir(bin, { recursive: true });
    const codex = path.join(bin, "codex");
    await fs.writeFile(codex, `#!/usr/bin/env node
const fs = require("fs");
const index = process.argv.indexOf("--output-last-message");
let prompt = "";
process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ type: "thread.started" }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "command_execution" } }) + "\\n");
  if (prompt === "hang") {
    setInterval(() => {}, 1_000);
    return;
  }
  process.stdout.write("x".repeat(512 * 1024));
  fs.writeFileSync(process.argv[index + 1], "next Codex completion: " + prompt);
});
`, { mode: 0o755 });
    process.env.CODEX_CHAT_LOOP_CODEX = codex;
    const sessionId = "11111111-2222-3333-4444-555555555555";
    const sessionDir = path.join(process.env.CODEX_HOME, "sessions", "2026", "08", "09");
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(path.join(sessionDir, `rollout-${sessionId}.jsonl`), [
      JSON.stringify({ type: "session_meta", payload: { session_id: sessionId, cwd: root, source: "cli" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "agent_message", message: "first Codex completion" } }),
      "",
    ].join("\n"));
    const suffix = `${Date.now()}-${Math.random()}`;
    const store = await import(`../src/store.mjs?test=${suffix}`);
    const supervisorModule = await import(`../src/supervisor.mjs?test=${suffix}`);
    await run({ root, sessionId, ...store, Supervisor: supervisorModule.Supervisor, startSupervisor: supervisorModule.startSupervisor });
  } finally {
    process.env.XDG_CONFIG_HOME = original.XDG_CONFIG_HOME;
    process.env.XDG_STATE_HOME = original.XDG_STATE_HOME;
    process.env.CODEX_HOME = original.CODEX_HOME;
    process.env.CODEX_CHAT_LOOP_CODEX = original.CODEX_CHAT_LOOP_CODEX;
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("supervisor safety and lifecycle controls", async (t) => {
  await withFixture(async ({ root, sessionId, initializeStore, readConfig, writeConfig, Supervisor, startSupervisor }) => {
    const secondSessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const sessionDir = path.join(process.env.CODEX_HOME, "sessions", "2026", "08", "09");
    await fs.writeFile(path.join(sessionDir, `rollout-${secondSessionId}.jsonl`), [
      JSON.stringify({ type: "session_meta", payload: { session_id: secondSessionId, cwd: root, source: "cli" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "agent_message", message: "second completion" } }),
      "",
    ].join("\n"));
    async function freshSupervisor() {
      await fs.rm(path.join(root, "config"), { recursive: true, force: true });
      await fs.rm(path.join(root, "state"), { recursive: true, force: true });
      return new Supervisor(await initializeStore());
    }

    await t.test("persists a handoff, requires review by default, drains JSON output, and queues the next turn", async () => {
      const supervisor = await freshSupervisor();
      const project = await supervisor.addProject({
        name: "fixture",
        cwd: root,
        sessionId,
        chatUrl: "https://chatgpt.com/c/fixture",
        tabId: 42,
      });
      await supervisor.adopt(project.id);
      assert.equal(supervisor.project(project.id).status, "awaiting_handoff_review");
      assert.match(supervisor.currentCompletion(project.id).completion, /first Codex completion/);
      await supervisor.sendCurrent(project.id);
      const initialAction = await supervisor.claimAction("extension-client");
      assert.match(initialAction.message, /first Codex completion/);
      assert.equal((await readConfig()).actions.length, 1);
      const received = await supervisor.receiveBrowserResult(initialAction.id, {
        clientId: "extension-client",
        tabId: 42,
        conversationKey: "https://chatgpt.com/c/fixture",
        reply: "<next_codex_prompt>Continue with the focused fix.</next_codex_prompt>",
      });
      assert.deepEqual(received, { awaitingApproval: true });
      assert.equal(supervisor.project(project.id).status, "awaiting_approval");
      assert.equal(supervisor.pendingPrompt(project.id).prompt, "Continue with the focused fix.");
      await supervisor.approve(project.id);
      const updated = supervisor.project(project.id);
      assert.equal(updated.status, "waiting_chatgpt");
      assert.equal(updated.rounds, 1);
      assert.match(updated.lastCodexOutput, /next Codex completion: Continue with the focused fix\./);
      assert.equal(updated.lastRun.eventSummary.items.command_execution, 1);
      const nextAction = await supervisor.claimAction("extension-client");
      assert.match(nextAction.message, /next Codex completion/);
      assert.deepEqual(await supervisor.receiveBrowserResult(initialAction.id, { clientId: "extension-client" }), { idempotent: true });
    });

    await t.test("rejects duplicate session and conversation mappings and a mismatched cwd", async () => {
      const supervisor = await freshSupervisor();
      const project = await supervisor.addProject({ name: "fixture", cwd: root, sessionId, chatUrl: "https://chatgpt.com/c/fixture" });
      await assert.rejects(() => supervisor.addProject({ name: "duplicate session", cwd: root, sessionId, chatUrl: "https://chatgpt.com/c/other" }), /already mapped/);
      await assert.rejects(() => supervisor.addProject({ name: "duplicate conversation", cwd: root, sessionId: secondSessionId, chatUrl: "https://chatgpt.com/c/fixture" }), /already mapped/);
      await assert.rejects(() => supervisor.addProject({ name: "wrong cwd", cwd: path.dirname(root), sessionId: secondSessionId, chatUrl: "https://chatgpt.com/c/other" }), /cwd must match/);
      assert.equal(supervisor.project(project.id).sessionId, sessionId);
    });

    await t.test("pauses a claimed action when the browser reports a different conversation", async () => {
      const supervisor = await freshSupervisor();
      const project = await supervisor.addProject({ name: "fixture", cwd: root, sessionId, chatUrl: "https://chatgpt.com/c/fixture" });
      await supervisor.adopt(project.id);
      await supervisor.sendCurrent(project.id);
      const action = await supervisor.claimAction("extension-client");
      await supervisor.receiveBrowserResult(action.id, {
        clientId: "extension-client",
        conversationKey: "https://chatgpt.com/c/wrong",
        reply: "<next_codex_prompt>Continue.</next_codex_prompt>",
      });
      assert.equal(supervisor.project(project.id).status, "paused");
      assert.equal(supervisor.status().pendingActions, 0);
    });

    await t.test("terminates a Codex run that exceeds its configured deadline", async () => {
      const supervisor = await freshSupervisor();
      const project = await supervisor.addProject({
        name: "fixture",
        cwd: root,
        sessionId,
        chatUrl: "https://chatgpt.com/c/fixture",
        autonomous: true,
      });
      supervisor.project(project.id).limits.maxRunMs = 20;
      await supervisor.adopt(project.id);
      await supervisor.sendCurrent(project.id);
      const action = await supervisor.claimAction("extension-client");
      await supervisor.receiveBrowserResult(action.id, {
        clientId: "extension-client",
        conversationKey: "https://chatgpt.com/c/fixture",
        reply: "<next_codex_prompt>hang</next_codex_prompt>",
      });
      const updated = supervisor.project(project.id);
      assert.equal(updated.status, "paused");
      assert.match(updated.pauseReason, /execution limit/);
      assert.equal(updated.activeRun, null);
    });

    await t.test("migrates version-one state to durable version-two state", async () => {
      await fs.rm(path.join(root, "config"), { recursive: true, force: true });
      await fs.rm(path.join(root, "state"), { recursive: true, force: true });
      const configDir = path.join(root, "config", "codex-chat-loop");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, "config.json"), JSON.stringify({
        version: 1,
        port: 41671,
        authToken: "a".repeat(43),
        projects: [{
          id: "project-id",
          name: "legacy",
          cwd: root,
          sessionId,
          chatUrl: "https://chatgpt.com/c/fixture",
          tabId: null,
          status: "paused",
          rounds: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastCodexOutput: null,
          lastChatGptReply: null,
          pauseReason: null,
        }],
      }));
      const migrated = await initializeStore();
      assert.equal(migrated.version, 2);
      assert.equal(migrated.projects[0].conversationKey, "https://chatgpt.com/c/fixture");
      assert.deepEqual(migrated.actions, []);
      assert.equal(JSON.parse(await fs.readFile(path.join(configDir, "config.json"), "utf8")).version, 2);
    });

    await t.test("binds one extension origin and requires the bearer token", async () => {
      await fs.rm(path.join(root, "config"), { recursive: true, force: true });
      await fs.rm(path.join(root, "state"), { recursive: true, force: true });
      const probe = net.createServer();
      await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
      const port = probe.address().port;
      await new Promise((resolve) => probe.close(resolve));
      const config = await initializeStore();
      config.port = port;
      await writeConfig(config);
      const { server } = await startSupervisor();
      if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
      try {
        assert.equal((await fetch(`http://127.0.0.1:${port}/v1/health`)).status, 401);
        assert.equal((await fetch(`http://127.0.0.1:${port}/v1/health`, {
          headers: { authorization: `Bearer ${config.authToken}` },
        })).status, 200);
        assert.equal((await fetch(`http://127.0.0.1:${port}/v1/status`)).status, 401);
        const trusted = await fetch(`http://127.0.0.1:${port}/v1/status`, {
          headers: { authorization: `Bearer ${config.authToken}`, origin: "chrome-extension://trusted" },
        });
        assert.equal(trusted.status, 200);
        assert.equal((await readConfig()).extensionOrigin, "chrome-extension://trusted");
        const untrusted = await fetch(`http://127.0.0.1:${port}/v1/status`, {
          headers: { authorization: `Bearer ${config.authToken}`, origin: "chrome-extension://other" },
        });
        assert.equal(untrusted.status, 401);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });
});
