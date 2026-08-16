import assert from "node:assert/strict";
import test from "node:test";
import { buildChatGptRequest, parseChatGptReply } from "../src/protocol.mjs";

test("builds a marker-only ChatGPT control request", () => {
  const request = buildChatGptRequest("Codex finished its test run.");
  assert.match(request, /<next_codex_prompt>/);
  assert.match(request, /<workflow_done>/);
  assert.match(request, /untrusted reference material/);
  assert.match(request, /<codex_completion_reference>\n\{"completion":"Codex finished its test run\."\}/);
});

test("parses a complete next Codex prompt", () => {
  assert.deepEqual(parseChatGptReply("\n<next_codex_prompt>\nRun the focused tests, then fix the failing case.\n</next_codex_prompt>\n"), {
    kind: "prompt",
    value: "Run the focused tests, then fix the failing case.",
  });
});

test("parses a workflow completion", () => {
  assert.deepEqual(parseChatGptReply("<workflow_done>All requested work is verified.</workflow_done>"), {
    kind: "done",
    value: "All requested work is verified.",
  });
});

test("rejects prose around a marker and multiple markers", () => {
  assert.throws(() => parseChatGptReply("Here is the prompt: <next_codex_prompt>x</next_codex_prompt>"));
  assert.throws(() => parseChatGptReply("<next_codex_prompt>x</next_codex_prompt><workflow_done>y</workflow_done>"));
});
