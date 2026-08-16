import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeStore, listRecentEvents, writeConfig } from "./store.mjs";
import { listSessions } from "./session-log.mjs";
import { appConfigDir, configPath } from "./paths.mjs";
import { startSupervisor } from "./supervisor.mjs";

const command = process.argv[2] || "help";

async function executable(commandName) {
  const candidates = path.isAbsolute(commandName)
    ? [commandName]
    : (process.env.PATH || "").split(path.delimiter).filter(Boolean).map((directory) => path.join(directory, commandName));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error(`unable to find executable: ${commandName}`);
}

function systemdQuote(value) {
  if (/[\r\n]/.test(value)) throw new Error("systemd unit values cannot contain a newline");
  return `"${value.replace(/[\\"]/g, "\\$&")}"`;
}

async function main() {
  if (command === "init") {
    const config = await initializeStore();
    process.stdout.write(`Configuration: ${configPath}\nExtension token: ${config.authToken}\n`);
    return;
  }
  if (command === "serve") {
    await executable(process.env.CODEX_CHAT_LOOP_CODEX || "codex");
    await startSupervisor();
    return;
  }
  if (command === "status") {
    const config = await initializeStore();
    const projects = config.projects.map(({ lastCodexOutput, lastChatGptReply, pendingPrompt, pendingPromptHash, ...project }) => ({
      ...project,
      hasCurrentCompletion: Boolean(lastCodexOutput),
      hasPendingPrompt: Boolean(pendingPrompt),
    }));
    process.stdout.write(`${JSON.stringify({ projects, pendingActions: config.actions.length, extensionOrigin: config.extensionOrigin }, null, 2)}\n`);
    return;
  }
  if (command === "sessions") {
    await initializeStore();
    process.stdout.write(`${JSON.stringify(await listSessions(), null, 2)}\n`);
    return;
  }
  if (command === "logs") {
    await initializeStore();
    process.stdout.write(`${JSON.stringify(await listRecentEvents(100), null, 2)}\n`);
    return;
  }
  if (command === "reset-extension-origin") {
    const config = await initializeStore();
    config.extensionOrigin = null;
    await writeConfig(config);
    process.stdout.write("Cleared the bound Chromium extension origin. Save the dashboard connection again to bind a new extension.\n");
    return;
  }
  if (command === "install-service") {
    const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const codex = await executable(process.env.CODEX_CHAT_LOOP_CODEX || "codex");
    const unit = `[Unit]\nDescription=Codex Chat Loop supervisor\n\n[Service]\nType=simple\nWorkingDirectory=${systemdQuote(root)}\nEnvironment=${systemdQuote(`CODEX_CHAT_LOOP_CODEX=${codex}`)}\nExecStart=${systemdQuote(process.execPath)} ${systemdQuote(path.join(root, "src", "loopctl.mjs"))} serve\nKillMode=control-group\nTimeoutStopSec=30\nRestart=on-failure\nRestartSec=3\n\n[Install]\nWantedBy=default.target\n`;
    const unitPath = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "systemd", "user", "codex-chat-loop.service");
    await fs.mkdir(path.dirname(unitPath), { recursive: true, mode: 0o700 });
    await fs.writeFile(unitPath, unit, { mode: 0o600 });
    process.stdout.write(`Installed ${unitPath}\nRun: systemctl --user daemon-reload && systemctl --user enable --now codex-chat-loop\n`);
    return;
  }
  process.stdout.write("Usage: node src/loopctl.mjs <init|serve|status|sessions|logs|reset-extension-origin|install-service>\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
