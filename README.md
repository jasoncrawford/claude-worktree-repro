# claude-worktree-repro

Reproduction for a bug where `EnterWorktree` state is lost across `query()` calls when resuming a session.

## Bug

When using `resume: sessionId` to continue a session across multiple `query()` calls:

1. First `query()`: Claude successfully invokes `EnterWorktree`
2. Second `query()` (resuming the same session): Claude invokes `ExitWorktree`
   → `ExitWorktree` errors: **"No active EnterWorktree session to exit"**

**Hypothesis:** Each `query()` spawns a fresh CLI subprocess. Resuming via `sessionId` replays the conversation history but not in-process state, so `ExitWorktree` sees no active worktree session.

Related issue: https://github.com/anthropics/claude-code/issues/31969

## Running the repro

```sh
npm install
npm run repro
```

Requires Node.js and a Claude Code installation (`claude` on PATH).
