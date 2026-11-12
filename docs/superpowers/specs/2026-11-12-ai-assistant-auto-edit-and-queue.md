# AI Assistant Auto Edit Mode, Interactive Message Queue & Tool Resilience Design

**Date**: 2026-11-12  
**Status**: Implemented / Authoritative  
**Author**: Torque Core Team  

---

## 1. Intent & The Why

Torque's integrated AI Assistant (`AgentClient`, `AiChatPanel`) acts as an embedded LaTeX co-author capable of reading, editing, compiling, and debugging documents, as well as searching academic papers and documentation. As users collaborate with the co-author on larger authoring tasks (refactoring multi-chapter theses, citing multiple papers, or running iterative compilation-fix loops), three major usability bottlenecks arose in previous iterations:

1. **Repetitive Approval Pauses in Autonomous Workflows**:
   When an agent executed multi-step authoring tasks across consecutive turns (e.g. read file -> patch chapter 1 -> patch chapter 2 -> compile -> analyze diagnostics), execution paused at every single file change waiting for the user to manually click "Accept" in `AiDiffCard`. For autonomous agentic runs, this completely halted progress.
2. **Dropped Follow-up Messages During Active Generation**:
   Users frequently think of additional context, corrections, or follow-up instructions while the AI is streaming tokens or executing tools. Previously, sending a message while `isGenerating` was true was either disabled or silently discarded, forcing users to wait and re-type their thoughts.
3. **Tool Parameter Brittleness Across LLM Providers**:
   Different LLMs and inference engines format function calling arguments differently: some emit `{ "filePath": "main.tex" }`, `{ "filename": "main.tex" }`, or `{ "file": "main.tex" }` instead of `{ "path": "main.tex" }`; others wrap parameters in `{ "params": { ... } }`, `{ "arguments": "{...}" }`, or `{ "input": { ... } }`. When missing, agents crashed with `Invalid path: path must be a non-empty string`.
4. **Opaque Multi-Second Thinking/Tool Execution**:
   When executing long tool operations (e.g. academic search, TeX Live compilation, multi-file inspection), the chat interface showed a static or missing indicator, leaving the user uncertain whether the assistant was compiling, downloading packages, querying arXiv, or hung.
5. **Top Bar Layout Crowding on Narrow Screens**:
   The IntelliJ-style centered run widget and project selector dropdown collided on medium/narrow viewports when project names were long.

This specification documents the architecture and implementation for **Auto Edit Mode**, **Interactive Message Queuing**, **Live Activity/Thinking Indicators**, **Tool Parameter Resilience**, and the **Responsive Centered Top Bar Run Widget**.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Auto Edit (Auto-Apply) Mode**: Allow the agent loop (`runTurn`) to automatically apply proposed file patches via `context.writeFile()` and proceed to subsequent turns without pausing for manual approval when `autoEdit: true` (or `autoApply: true`) is active.
- **Interactive Message Queuing**: Queue user inputs entered while `isGenerating` is true in a FIFO queue. Provide visible UI inspection of queued items with clear-all and per-item deletion capabilities, and auto-dispatch the next queued message when the current generation finishes.
- **Real-Time Execution Indicators**: Provide continuous status updates (`thinking`, `reading file`, `compiling`, `searching`) via `onStatusChange` callbacks rendered with IntelliJ-themed animated pulse pills.
- **Universal Parameter Resilience**: Eliminate `Invalid path: path must be a non-empty string` and similar parameter errors by unwrapping nested argument envelopes (`params`, `arguments`, `input`) and checking alias keys (`filePath`, `filename`, `file`, `targetPath`, `search`, `replace`, etc.) with fallback to the active editor document.
- **Responsive Top Bar Layout**: Ensure the centered IntelliJ run widget pill remains legible across viewports with dynamic project title truncation.

### Non-Goals
- **Removing Manual Diff Inspection**: Manual diff review (`AiDiffCard`) remains the default safe mode when `autoEdit` is not selected.
- **Unbounded Queue Depth**: Queuing is tailored for interactive follow-ups rather than script batch scheduling.

### Anti-Goals
- **Silent Failures on File Edits**: Auto-applied patches must still compute full diffs, log status messages, and record updated contents in chat history.
- **Overlapping Agent Invocations**: Never execute two agent turns concurrently; queued messages must execute sequentially.

---

## 3. Constraints & Architectural Invariants

- **Zero Breaking Changes**: Must maintain 100% compatibility with existing `WorkspaceToolContext` and `AIProviderConfig`.
- **IntelliJ IDEA New UI Design Language**: All queue badges, status pills, and buttons must use Darcula (`#1e1f22`, `#2b2d30`, `#3574f0`) and IntelliJ Light palette conventions.
- **Next.js Static Export & Tauri Desktop Compatibility**: Code must run without server runtime dependencies in Tauri Desktop and browser builds.
- **Verification Requirement**: All changes must pass `npm test`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml`.

---

## 4. Architectural Specification & Subsystem Design

### 4.1 Auto Edit Mode (`autoEdit` / `autoApply`)

The agent loop in `src/ai/agentClient.ts` handles tool execution across multiple turns:

```typescript
// src/types/ai.ts & src/ai/agentClient.ts
export interface AgentLoopOptions {
  maxTurns?: number;
  systemPrompt?: string;
  onChunk?: (token: string) => void;
  onMessagesChange?: (messages: ChatMessage[]) => void;
  onStatusChange?: (status: AgentStatus | null) => void;
  signal?: AbortSignal;
  autoApply?: boolean;
  autoEdit?: boolean;
}
```

#### Multi-Turn Execution Logic
1. When the assistant returns tool calls with surgical diffs (`torque_edit_file`) or full file replacements (`torque_write_file`), they initially receive `status: 'pending_approval'`.
2. When `options.autoApply || options.autoEdit` evaluates to `true`:
   ```typescript
   const isAutoApply = Boolean(options?.autoApply || options?.autoEdit);
   if (isAutoApply) {
     for (const tc of assistantMsg.toolCalls) {
       if (
         (tc.name === 'torque_edit_file' || tc.name === 'torque_write_file') &&
         tc.status === 'pending_approval' &&
         tc.diff
       ) {
         await context.writeFile(tc.diff.path, tc.diff.newContent);
         tc.status = 'accepted';
         tc.result = { status: 'success', message: 'Changes auto-applied to workspace.' };
       }
     }
     options?.onMessagesChange?.([...workingMessages]);
   }
   ```
3. Because no tool calls remain with `status === 'pending_approval'`, the loop does NOT break prematurely. Instead, it converts tool execution results to messages (`role: 'tool'`) and dispatches the next turn to the model.
4. The model observes that its edits succeeded and can immediately proceed to invoke `torque_compile` or write additional files.

---

### 4.2 Interactive Message Queuing

In `src/components/AiChatPanel.tsx`, message submission is decoupled from synchronous execution:

```
User types follow-up ──► handleSend()
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
           isGenerating === false   isGenerating === true
                    │                   │
                    ▼                   ▼
          executeSendMessage(text)    messageQueueRef.current.push(text)
                                      setMessageQueue([...queue])
                                                │
                                                ▼
                                    Rendered in Queued Messages UI
                                    (can remove or clear)
                                                │
                                    Active turn finishes (finally)
                                                │
                                                ▼
                                    nextMessage = queue.shift()
                                    executeSendMessage(nextMessage)
```

#### Queue Invariants:
1. **Ref + State Synchronization**: Uses `messageQueueRef` alongside `messageQueue` state to prevent race conditions during rapid user input or turn transitions.
2. **Session Persistence**: Current session is tracked via `sessionsRef` and `activeSessionIdRef` so queued messages always append to the correct active chat thread.
3. **Queue Controls**:
   - `handleClearQueue`: Empties queue immediately.
   - `handleRemoveQueuedMessage(index)`: Removes a specific queued item by index.
   - Stop button (`handleStopGenerating`): Aborts active generation via `AbortController`, but retains queued messages unless explicitly cleared by the user.

---

### 4.3 Thinking & Execution Activity Indicators

Real-time feedback is provided through structured status events:

```typescript
export interface AgentStatus {
  type: 'thinking' | 'executing_tool';
  toolName?: string;
  detail?: string;
}
```

#### Status Lifecycle:
- Prior to sending HTTP completion request:
  `options?.onStatusChange?.({ type: 'thinking', detail: 'Thinking...' });`
- When executing specific tools:
  - `torque_read_file`: `detail: "Reading <path>..."`
  - `torque_edit_file`: `detail: "Editing <path>..."`
  - `torque_write_file`: `detail: "Writing to <path>..."`
  - `torque_compile`: `detail: "Compiling LaTeX document..."`
  - `torque_get_diagnostics`: `detail: "Retrieving diagnostics..."`
  - `torque_search_academic`: `detail: "Searching academic papers: \"<query>\"..."`
  - `torque_search_web`: `detail: "Searching the web: \"<query>\"..."`
- When turn or error concludes:
  `options?.onStatusChange?.(null)`
- UI Render: Rendered in `AiChatPanel` above the scroll anchor with an animated `animate-spin` loader or pulse dot in Darcula accent colors (`#3574f0`).

---

### 4.4 Tool Parameter Resilience

Both frontend (`src/ai/tools.ts`) and backend (`scripts/compiler-server.js`, `src-tauri/src/mcp/files.rs`) implement layered unwrapping to prevent tool invocation failures.

#### Parameter Aliases & Hierarchy
```typescript
const PATH_KEYS = [
  'path', 'filePath', 'filepath', 'filename', 'fileName',
  'file', 'targetPath', 'relPath', 'relative_path', 'Path', 'FilePath'
];

const CONTENT_KEYS = [
  'content', 'code', 'text', 'contents', 'data', 'Content', 'Code'
];

const TARGET_KEYS = [
  'target', 'find', 'search', 'original', 'oldText', 'old_text', 'Target'
];

const REPLACEMENT_KEYS = [
  'replacement', 'replace', 'substitute', 'newText', 'new_text', 'Replacement'
];
```

#### Nested Envelope Unwrapping (`unwrapToolArgs` / `unwrap_args`):
```typescript
export function unwrapToolArgs(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  if (obj.params && typeof obj.params === 'object' && !Array.isArray(obj.params)) {
    return unwrapToolArgs(obj.params);
  }
  if (typeof obj.arguments === 'string') {
    try {
      const parsed = JSON.parse(obj.arguments);
      if (parsed && typeof parsed === 'object') return unwrapToolArgs(parsed);
    } catch {}
  }
  if (obj.arguments && typeof obj.arguments === 'object') return unwrapToolArgs(obj.arguments);
  if (obj.input && typeof obj.input === 'object') return unwrapToolArgs(obj.input);
  return obj;
}
```

#### Fallback Path Resolution:
If no path key is present, `extractToolPath(args, context.activeFilePath)` falls back to `context.activeFilePath` (e.g. `main.tex`), ensuring single-file documents never fail when the LLM omits the path.

---

### 4.5 Responsive Top Bar Pill & Run Widget

`src/components/ProjectTopBar.tsx` features IntelliJ IDEA New UI centered toolbar layout:
- **Project Switcher Truncation**: Dynamic truncation classes `max-w-[80px] sm:max-w-[130px] md:max-w-[180px]` prevent header blowout on smaller screen resolutions.
- **Centered Pill Run Widget**: Houses the Run button, Engine selector, and compile status pill in a unified container with border `#323232` (dark) and `#d1d5db` (light).
- **Flex Shrinking Safety**: Container wrappers utilize `min-w-0` to allow items to shrink gracefully without hiding essential buttons or causing horizontal window scrolling.

---

## 5. Verification & Testing

The subsystem is thoroughly tested across multiple unit suites:
1. `src/ai/__tests__/tools.test.ts`: Validates `extractToolPath`, `extractToolContent`, `extractToolEditTargets`, and `extractToolQuery` against nested arguments, alias keys, and active file fallbacks.
2. `src/ai/__tests__/agentClient.test.ts`: Tests `runTurn` with `autoEdit: true`, verifying that files are automatically written, accepted, and multi-turn loops continue uninterrupted.
3. `src/components/__tests__/AiChatPanel.test.tsx`: Validates interactive message queuing, queue item rendering, removal, clear all, and indicator display.
4. `src/components/__tests__/ProjectTopBar.test.tsx`: Tests responsive layout rendering and button clicks.
5. `src-tauri/src/mcp/tests.rs`: Tests native Rust MCP parameter unwrapping across all tools.
