/**
 * Reproduction for: EnterWorktree state lost across query() calls with resume:sessionId
 *
 * Steps:
 *   1. First query() call: Claude successfully invokes EnterWorktree
 *   2. Second query() call (resuming same session): Claude invokes ExitWorktree
 *      → ExitWorktree errors: "No active EnterWorktree session to exit"
 *
 * Root cause hypothesis: each query() spawns a fresh CLI subprocess. resume:sessionId
 * replays conversation history but not in-process state, so ExitWorktree sees no
 * active worktree session.
 *
 * Related issue: https://github.com/anthropics/claude-code/issues/31969
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const sdkRoot = require.resolve("@anthropic-ai/claude-agent-sdk").replace(/\/[^/]+$/, "");
const { version: sdkVersion } = JSON.parse(readFileSync(`${sdkRoot}/package.json`, "utf8"));
console.log(`Claude Agent SDK version: ${sdkVersion}`);

async function runQuery(prompt: string, sessionId: string | undefined): Promise<string | undefined> {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`QUERY: ${prompt}`);
  console.log(`SESSION ID IN: ${sessionId ?? "(none — fresh session)"}`);
  console.log(`${"─".repeat(60)}`);

  let capturedSessionId: string | undefined = sessionId;
  let capturedModel: string | undefined;

  const iterable = query({
    prompt,
    options: {
      cwd: process.cwd(),
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["user", "project"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      ...(sessionId ? { resume: sessionId } : {}),
    },
  });

  for await (const message of iterable) {
    if (message.type === "system" && message.subtype === "init" && !capturedSessionId) {
      capturedSessionId = message.session_id;
      console.log(`SESSION ID CAPTURED: ${capturedSessionId}`);
    }

    if (message.type === "assistant") {
      if (!capturedModel) {
        capturedModel = message.message.model;
        console.log(`Model: ${capturedModel}`);
      }
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim()) {
          console.log(`\nClaude: ${block.text.trim()}`);
        }
        if (block.type === "tool_use") {
          console.log(`\nTool call: ${block.name}(${JSON.stringify(block.input)})`);
        }
      }
    }

    if (message.type === "user" && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type === "tool_result") {
          const content = Array.isArray(block.content)
            ? block.content.map((c: { type: string; text?: string }) => c.type === "text" ? c.text : "").join("")
            : String(block.content ?? "");
          const status = block.is_error ? "ERROR" : "OK";
          console.log(`Tool result [${status}]: ${content.trim()}`);
        }
      }
    }

    if (message.type === "result") {
      console.log(`\nResult: ${message.subtype}`);
    }
  }

  return capturedSessionId;
}

// Run two sequential queries, passing the session ID from the first to the second.
let sessionId = await runQuery(
  "Please invoke the EnterWorktree tool to create a worktree.",
  undefined,
);

await runQuery(
  "Now please invoke ExitWorktree to exit, removing the worktree.",
  sessionId,
);
