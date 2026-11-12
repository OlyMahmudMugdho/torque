# AI Assistant Auto Edit Mode, Interactive Message Queue & Tool Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and verify Auto Edit Mode, interactive message queuing with auto-dispatch, real-time activity/thinking indicators, parameter resilience across tool invocations, and responsive top bar pill widget in Torque.

**Architecture:**
- **Auto Edit Mode**: Add `autoEdit` / `autoApply` flags to `AgentLoopOptions`, auto-applying file changes via `context.writeFile()` and continuing multi-turn execution.
- **Message Queuing**: Implement FIFO message queue in `AiChatPanel` with queue UI display, individual item deletion, clear-all action, and sequential auto-dispatch.
- **Indicators**: Emit structured `AgentStatus` events (`thinking`, `executing_tool`) and render live IntelliJ-themed status pills in the chat feed.
- **Tool Resilience**: Implement layered parameter unwrapping (`unwrapToolArgs`, `extractToolPath`, `extractToolContent`, `extractToolEditTargets`, `extractToolQuery`) and active file fallback in TypeScript and Rust (`src-tauri/src/mcp/files.rs`, `scripts/compiler-server.js`).
- **Responsive Top Bar**: Update `ProjectTopBar.tsx` layout with responsive truncation and centered run widget pill.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, Monaco Editor, Rust (Tauri v2), Vitest, Tailwind CSS, Lucide icons.

**Spec:** [`docs/superpowers/specs/2026-11-12-ai-assistant-auto-edit-and-queue.md`](file:///home/mugdho/codes/torque/docs/superpowers/specs/2026-11-12-ai-assistant-auto-edit-and-queue.md)

---

## Global Constraints

- TeX Live native execution & clean architecture invariants from `MAP.md` and `AGENTS.md`.
- No regression in interactive diff review: `autoEdit: false` must still show `AiDiffCard` and wait for manual approval.
- Queued messages must never trigger concurrent overlapping generation calls.
- Path normalization must strictly block parent traversal (`..`).
- All tests must pass: `npm test`, `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml`.

---

### Task 1: Tool Parameter Resilience & Argument Extraction

**Files:**
- Modify: `src/ai/tools.ts`
- Modify: `scripts/compiler-server.js`
- Modify: `src-tauri/src/mcp/files.rs`
- Test: `src/ai/__tests__/tools.test.ts`
- Test: `src-tauri/src/mcp/tests.rs`

- [x] **Step 1: Write unit tests for parameter extraction**
  Create test cases in `src/ai/__tests__/tools.test.ts` covering:
  - Alternative path keys (`filePath`, `filename`, `file`, `targetPath`).
  - Nested arguments (`args.params`, `args.arguments` string/object, `args.input`).
  - Active file fallback when path is omitted or empty.
  - Content extraction from `content`, `code`, `text`.
  - Target and replacement extraction from `find`, `search`, `replace`, `substitute`.
- [x] **Step 2: Implement extraction functions in `src/ai/tools.ts`**
  Add `unwrapToolArgs`, `extractToolPath`, `extractToolContent`, `extractToolEditTargets`, and `extractToolQuery`.
- [x] **Step 3: Update `scripts/compiler-server.js` tool handlers**
  Mirror parameter extraction helpers in Node.js server to handle MCP calls with varied argument wrappers.
- [x] **Step 4: Update Rust Tauri MCP handlers in `src-tauri/src/mcp/files.rs`**
  Implement `unwrap_args`, `extract_path`, `extract_content`, `extract_target`, and `extract_replacement`.
- [x] **Step 5: Run unit tests**
  Verify via `npx vitest run src/ai/__tests__/tools.test.ts` and `cargo test --manifest-path src-tauri/Cargo.toml`.

---

### Task 2: Auto Edit (Auto-Apply) Mode in Multi-Turn Agent Loop

**Files:**
- Modify: `src/types/ai.ts`
- Modify: `src/ai/agentClient.ts`
- Test: `src/ai/__tests__/agentClient.test.ts`

- [x] **Step 1: Extend `AgentLoopOptions` interface**
  Add `autoApply?: boolean` and `autoEdit?: boolean` flags to `AgentLoopOptions` in `src/types/ai.ts` and `src/ai/agentClient.ts`.
- [x] **Step 2: Implement auto-apply logic in `runTurn`**
  If `options.autoApply || options.autoEdit` is truthy:
  - Iterate through pending `torque_edit_file` and `torque_write_file` tool calls.
  - Write file content to workspace via `context.writeFile()`.
  - Update tool call status to `accepted` and set result to `{ status: 'success', message: 'Changes auto-applied to workspace.' }`.
  - Continue multi-turn loop without breaking on `hasPendingApproval`.
- [x] **Step 3: Add unit tests for auto-apply multi-turn execution**
  In `src/ai/__tests__/agentClient.test.ts`, verify that:
  - `runTurn` with `autoEdit: true` automatically calls `context.writeFile` for file diffs.
  - Multi-turn execution continues past the edit turn to subsequent turns.
- [x] **Step 4: Verify test suite**
  Run `npx vitest run src/ai/__tests__/agentClient.test.ts`.

---

### Task 3: Interactive Message Queuing & Live Activity Indicators

**Files:**
- Modify: `src/types/ai.ts`
- Modify: `src/ai/agentClient.ts`
- Modify: `src/components/AiChatPanel.tsx`
- Test: `src/components/__tests__/AiChatPanel.test.tsx`

- [x] **Step 1: Add status reporting callbacks to `AgentClient`**
  Define `AgentStatus` (`type: 'thinking' | 'executing_tool'`, `toolName?`, `detail?`). Invoke `onStatusChange` before fetch (`thinking`) and during tool executions (`torque_read_file`, `torque_compile`, `torque_search_academic`, etc.).
- [x] **Step 2: Implement message queue state and ref in `AiChatPanel`**
  Add `messageQueue` state and `messageQueueRef`.
  - If `isGenerating === true`, append input to queue instead of ignoring.
  - When active generation finishes in `finally`, dequeue the next message and dispatch after a 50ms tick.
- [x] **Step 3: Add interactive queue UI and indicator components**
  - Render queued messages count, clear all button, and per-item remove `X` button.
  - Render animated status pill with current thinking or tool execution activity.
- [x] **Step 4: Write unit tests for queuing and indicators**
  In `src/components/__tests__/AiChatPanel.test.tsx`, verify:
  - Sending a message while generating enqueues the message.
  - Queued messages UI is displayed with correct count and items.
  - Clicking remove button removes the item from queue.
  - Clicking clear all empties the queue.
- [x] **Step 5: Run tests**
  Run `npx vitest run src/components/__tests__/AiChatPanel.test.tsx`.

---

### Task 4: Responsive Centered Top Bar & Project Selector

**Files:**
- Modify: `src/components/ProjectTopBar.tsx`
- Test: `src/components/__tests__/ProjectTopBar.test.tsx`

- [x] **Step 1: Update flex layout and responsive truncation**
  In `ProjectTopBar.tsx`:
  - Change project selector title max-width to responsive breakpoints (`max-w-[80px] sm:max-w-[130px] md:max-w-[180px] truncate`).
  - Use `min-w-0` on left and right action containers to prevent horizontal scrolling and layout overflow.
- [x] **Step 2: Verify component tests**
  Run `npx vitest run src/components/__tests__/ProjectTopBar.test.tsx`.

---

### Task 5: Full Regression & Verification

- [x] **Step 1: Run all Vitest suites**
  Execute `npm test`. All 43 test files and 488+ tests must pass.
- [x] **Step 2: Run Cargo native backend tests**
  Execute `cargo test --manifest-path src-tauri/Cargo.toml`. All 32 tests must pass.
- [x] **Step 3: Run static export build**
  Execute `npm run build` to confirm zero TypeScript compilation or export errors.
