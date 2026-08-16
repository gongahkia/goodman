# Codex Chat Loop

Codex Chat Loop is a local supervisor and Chromium extension for continuing one persisted Codex CLI session from one existing ChatGPT conversation. The supervisor listens only on `127.0.0.1`; it does not use the OpenAI API and does not change Codex’s configured sandbox or approval policy.

It is not a no-data-egress tool. Codex completion text is submitted to the mapped ChatGPT conversation through the browser, so source code, paths, test output, or other material in that completion can leave the local machine under the ChatGPT account’s normal data handling. Review the workstream’s data classification before adopting it.

## How the loop works

1. Map one canonical ChatGPT `/c/<conversation-id>` URL to one persisted Codex session and its recorded working directory.
2. Adopt the latest completed Codex message. The extension submits a bounded handoff request to that dedicated conversation.
3. ChatGPT must reply with exactly one marker-wrapped `next_codex_prompt` or `workflow_done` value.
4. By default, the proposed Codex prompt appears in the extension dashboard for review. **Run reviewed prompt** resumes Codex. Automatic continuation is an explicit per-workstream opt-in.
5. Codex runs with its existing configuration, writes its final message to a private run directory, and emits JSONL events for the local audit trail. Its next completion becomes the next browser handoff.

The supervisor enforces one mapping per Codex session and one mapping per ChatGPT conversation. It cannot detect a separately launched interactive Codex process, so do not resume a mapped session elsewhere while the loop owns it.

## Install

From this directory:

```zsh
npm run init
npm run serve
```

`npm run init` creates a 32-byte local bearer token in `~/.config/codex-chat-loop/config.json` (or the equivalent XDG location), with mode `0600`.

In Chromium, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/`. Open the extension, paste the token, and save. The first authenticated extension connection binds that Chromium extension origin to the supervisor. If an unpacked extension receives a new ID, run:

```zsh
npm run reset-extension-origin
```

Load the target existing ChatGPT conversation before creating a workstream. The extension deliberately injects its content script only into the exact tab selected for a pending action.

To install the supervisor as a user service after verifying it manually:

```zsh
npm run install-service
systemctl --user daemon-reload
systemctl --user enable --now codex-chat-loop
```

The generated unit pins the currently resolved Node and Codex executable paths, uses a control-group kill mode, and sets a stop timeout.

## Safety controls and limits

- The local HTTP API requires the generated bearer token. The extension origin is bound after its first authenticated request.
- ChatGPT URLs are canonicalized and matched exactly; browser replies from another conversation pause the workstream.
- Browser result delivery is kept in extension storage until the supervisor acknowledges it. Repeated result delivery is idempotent.
- New workstreams require dashboard approval for every next Codex prompt unless automatic continuation is explicitly selected.
- Prompts requesting known Codex approval or sandbox bypass flags are rejected.
- The control prompt treats Codex completion text as untrusted reference material. This reduces, but does not eliminate, prompt-injection risk; review mode is the primary control.
- High-confidence private-key, OpenAI API-key, GitHub PAT, and AWS access-key patterns are redacted before browser submission. This is not a complete secret-detection system.
- Each workstream defaults to 12 Codex rounds, 120,000 remotely submitted characters, 12,000 received prompt characters, and a 20-minute Codex execution timeout. Repeated final completions or repeated next prompts pause the workstream.
- Codex reads the next prompt from stdin instead of an argv string, drains JSONL stdout, retains bounded stderr diagnostics, and writes final output inside a private state directory rather than the global temporary directory.
- Full handoff transcripts are discarded after a successful handoff unless **Retain full handoff transcripts locally** was selected when mapping the workstream. Current pending output and approved prompt remain locally until the action completes or is removed.

The app preserves the installed Codex CLI configuration. Before enabling automatic continuation, verify that the session’s configured approvals, sandbox, MCP servers, hooks, and network access are appropriate for unattended execution. The supervisor cannot make an unsafe Codex configuration safe.

## Recovery and operations

On startup, browser handoffs, active Codex turns, and unreviewed prompts are paused. This avoids an ambiguous duplicate send or resume. If a recorded Codex PID may still be active, the dashboard blocks that session until you confirm that the prior process has stopped. Then review the outbound completion or next prompt before continuing.

Useful commands:

```zsh
npm run status
npm run sessions
npm run logs
```

The dashboard shows current workstream status, rounds, remote-character budget, the review prompt, and recent structured events. Events include action claims, browser failures, Codex duration, and a bounded JSONL event/type summary. They are stored locally in the XDG state directory with mode `0600`; the active event file rotates at 5 MiB without deleting prior rotated files.

## Verification

```zsh
npm run check
npm test
```

The automated suite covers protocol parsing, durable action state, review gating, duplicate mapping rejection, conversation mismatch handling, and a verbose fake Codex JSONL stream. It does not exercise ChatGPT’s live UI. ChatGPT UI changes can still break the composer or message selectors; those failures pause the affected workstream and should be reproduced in a controlled browser session before updating `extension/content.js`.
