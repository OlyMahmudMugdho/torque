# AI LaTeX Assistant & OpenAI-Compatible Chat with Diff Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an integrated AI LaTeX Assistant co-author in Torque featuring multi-session chat, OpenAI-compatible multi-provider configuration (with local `~/.torque/ai_config.json` credentials and `langchain-rust` backend streaming), workspace tools, and OpenAI Prism-style interactive diff review.

**Architecture:** A hybrid architecture where Tauri backend (powered by `langchain-rust`) persists credentials and bridges streaming chat completions to bypass browser CORS for local models (e.g. Ollama, LM Studio), while a TypeScript reactive agent loop manages workspace tools (`read_file`, `edit_file`, `write_file`, `compile`, `get_diagnostics`) and pauses file mutations into a `pending_approval` state. Edits render in the chat feed as interactive `AiDiffCard` elements with collapsible unified diffs and Accept/Reject buttons that cleanly patch Monaco editor and project storage.

**Tech Stack:** TypeScript, React, Next.js 16, Monaco Editor, Tailwind CSS, Rust, Tauri v2, `langchain-rust`, `serde`, `diff` / Myers diff algorithm, Lucide React.

**Spec:** [`docs/superpowers/specs/2026-11-05-ai-chat-latex-assistant-design.md`](file:///home/mugdho/codes/torque/docs/superpowers/specs/2026-11-05-ai-chat-latex-assistant-design.md)

## Global Constraints
- SemVer authority: `src/version.ts` and `package.json`.
- Zero-space diagnostics & tool window dismissal: when collapsed, tool windows must not leave blank margins or dead space.
- Desktop persistence: credentials and configs stored under `~/.torque/ai_config.json` via Tauri IPC with web fallback to IndexedDB/localStorage.
- Path traversal protection: all file access from tools must be validated and sanitized using `normalizeFilePath`.
- IntelliJ IDEA New UI aesthetics: dark (`#2b2d30` / `#1e1f22`) and light (`#ffffff` / `#ebecf0`) themes with `#3574f0` accent and standard JetBrains keybindings.

## Review Focus
1. Handling empty or malformed API responses from custom base URLs without crashing the agent loop.
2. Preventing stale diff patches if the user edits the Monaco document while a diff review is pending.
3. Rejecting directory traversal attempts (`../../`) in tool arguments cleanly and reporting the error to the model.
4. Handling multiple tool calls in a single completion turn so that all tool outputs are returned together.
5. Preserving chat history and active provider selection across application restarts.

---

### Task 1: AI Provider Config & Types Subsystem

**Files:**
- Create: `src/types/ai.ts`
- Create: `src/ai/aiConfig.ts`
- Test: `src/ai/__tests__/aiConfig.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface AIProviderConfig {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    selectedModel: string;
    availableModels: string[];
  }
  export interface AISettings {
    providers: AIProviderConfig[];
    activeProviderId: string | null;
  }
  export function getDefaultAISettings(): AISettings;
  export async function loadAISettings(): Promise<AISettings>;
  export async function saveAISettings(settings: AISettings): Promise<void>;
  export async function fetchProviderModels(baseUrl: string, apiKey?: string): Promise<string[]>;
  ```

- [ ] **Step 1: Write failing unit test for AI config**
Create `src/ai/__tests__/aiConfig.test.ts` testing default settings generation, serialization, loading with Tauri mock vs localStorage fallback, and model list fetching.
- [ ] **Step 2: Run test to verify it fails**
Run `npx vitest run src/ai/__tests__/aiConfig.test.ts` and ensure it fails due to missing modules.
- [ ] **Step 3: Implement `src/types/ai.ts` and `src/ai/aiConfig.ts`**
Implement default settings, `loadAISettings()`, `saveAISettings()`, and `fetchProviderModels()` using `isTauri()` check and fallback to browser storage.
- [ ] **Step 4: Run test to verify it passes**
Run `npx vitest run src/ai/__tests__/aiConfig.test.ts` and ensure all tests pass.
- [ ] **Step 5: Commit**
`git add src/types/ai.ts src/ai/aiConfig.ts src/ai/__tests__/aiConfig.test.ts && git commit -m "feat(ai): add AI provider configuration subsystem and tests"`

---

### Task 2: Rust Backend AI Credential Storage & Native Streaming Bridge

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/ai.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/ai.rs` (inline tests)

**Interfaces:**
- Produces:
  - Tauri commands: `tauri_get_ai_config`, `tauri_save_ai_config`, `tauri_ai_chat_stream`.
  - Storage path: `~/.torque/ai_config.json`.

- [ ] **Step 1: Write failing Rust test for AI config storage**
In `src-tauri/src/ai.rs`, define unit tests verifying loading/saving config to custom paths, ensuring directory creation and valid JSON formatting.
- [ ] **Step 2: Add dependencies to `src-tauri/Cargo.toml`**
Add `reqwest = { version = "0.12", features = ["json", "stream"] }` and configure `langchain-rust` or streaming client.
- [ ] **Step 3: Implement `src-tauri/src/ai.rs` and register commands in `src-tauri/src/lib.rs`**
Implement `tauri_get_ai_config`, `tauri_save_ai_config`, and streaming endpoint.
- [ ] **Step 4: Run cargo test to verify backend tests pass**
Run `cargo test --manifest-path src-tauri/Cargo.toml` and verify zero errors.
- [ ] **Step 5: Commit**
`git add src-tauri/Cargo.toml src-tauri/src/ai.rs src-tauri/src/lib.rs && git commit -m "feat(tauri): add AI config persistence and streaming commands"`

---

### Task 3: Workspace Tools & Unified Diff Utility

**Files:**
- Create: `src/ai/diffUtils.ts`
- Create: `src/ai/tools.ts`
- Test: `src/ai/__tests__/diffUtils.test.ts`
- Test: `src/ai/__tests__/tools.test.ts`

**Interfaces:**
- Consumes: `src/storage/pathUtils.ts` (`normalizeFilePath`), `src/types/workspace.ts`.
- Produces:
  ```typescript
  export interface FileDiffResult {
    path: string;
    originalContent: string;
    newContent: string;
    additions: number;
    deletions: number;
    diffHunks: Array<{ type: 'context' | 'added' | 'deleted'; line: string; oldLineNo?: number; newLineNo?: number }>;
    unifiedDiff: string;
  }
  export function computeFileDiff(path: string, original: string, updated: string): FileDiffResult;
  export function applyFilePatch(original: string, target: string, replacement: string): { success: boolean; content: string; error?: string };
  export const WORKSPACE_TOOLS_SCHEMA: Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }>;
  ```

- [ ] **Step 1: Write failing tests for diff computation and tool schema validation**
Create `src/ai/__tests__/diffUtils.test.ts` testing line additions/deletions, patch applications, and `src/ai/__tests__/tools.test.ts` verifying tool schemas and path traversal rejection.
- [ ] **Step 2: Run tests to verify they fail**
Run `npx vitest run src/ai/__tests__/diffUtils.test.ts src/ai/__tests__/tools.test.ts`.
- [ ] **Step 3: Implement `src/ai/diffUtils.ts` and `src/ai/tools.ts`**
Implement Myers / line-based diff computation, patch verification, and the 5 OpenAI-compatible tool specifications.
- [ ] **Step 4: Run tests to verify they pass**
Run `npx vitest run src/ai/__tests__/diffUtils.test.ts src/ai/__tests__/tools.test.ts`.
- [ ] **Step 5: Commit**
`git add src/ai/diffUtils.ts src/ai/tools.ts src/ai/__tests__/diffUtils.test.ts src/ai/__tests__/tools.test.ts && git commit -m "feat(ai): implement diff computation and workspace tool definitions"`

---

### Task 4: Agent Client Loop & Prism-Style Approval State Machine

**Files:**
- Create: `src/ai/agentClient.ts`
- Test: `src/ai/__tests__/agentClient.test.ts`

**Interfaces:**
- Consumes: `src/ai/aiConfig.ts`, `src/ai/tools.ts`, `src/ai/diffUtils.ts`.
- Produces:
  ```typescript
  export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      args: Record<string, any>;
      status: 'pending_approval' | 'accepted' | 'rejected' | 'executing' | 'done' | 'failed';
      diff?: FileDiffResult;
      result?: any;
    }>;
    timestamp: number;
  }
  export class AgentClient {
    constructor(config: AIProviderConfig);
    sendMessage(messages: ChatMessage[], context: WorkspaceToolContext, onChunk?: (text: string) => void): Promise<ChatMessage>;
    approveToolCall(messageId: string, toolCallId: string, context: WorkspaceToolContext): Promise<void>;
    rejectToolCall(messageId: string, toolCallId: string): Promise<void>;
  }
  ```

- [ ] **Step 1: Write failing tests for AgentClient**
Create `src/ai/__tests__/agentClient.test.ts` simulating multi-turn message handling, tool execution, pausing on edits for diff approval, and resuming after Accept/Reject.
- [ ] **Step 2: Run test to verify it fails**
Run `npx vitest run src/ai/__tests__/agentClient.test.ts`.
- [ ] **Step 3: Implement `src/ai/agentClient.ts`**
Implement the streaming OpenAI request dispatcher, tool execution handler, diff generator on file mutation tools, and pause/resume logic.
- [ ] **Step 4: Run test to verify it passes**
Run `npx vitest run src/ai/__tests__/agentClient.test.ts`.
- [ ] **Step 5: Commit**
`git add src/ai/agentClient.ts src/ai/__tests__/agentClient.test.ts && git commit -m "feat(ai): implement agent loop and approval state machine"`

---

### Task 5: AI Settings Panel in Settings Modal

**Files:**
- Modify: `src/components/SettingsModal.tsx`
- Test: `src/components/__tests__/SettingsModalAi.test.tsx`

**Interfaces:**
- Consumes: `src/ai/aiConfig.ts`, `src/types/ai.ts`.
- Produces: AI configuration tab in Settings with provider list, Base URL, API Key, Model selector, and Connection Test button.

- [ ] **Step 1: Write failing test for SettingsModal AI category**
Create `src/components/__tests__/SettingsModalAi.test.tsx` checking that clicking the AI category reveals provider inputs, handles adding/editing providers, and saves settings.
- [ ] **Step 2: Run test to verify it fails**
Run `npx vitest run src/components/__tests__/SettingsModalAi.test.tsx`.
- [ ] **Step 3: Update `src/components/SettingsModal.tsx`**
Add `ai` category with Sparkles / Brain icon, provider selection list, connection test handler, and form fields matching IntelliJ design.
- [ ] **Step 4: Run test to verify it passes**
Run `npx vitest run src/components/__tests__/SettingsModalAi.test.tsx`.
- [ ] **Step 5: Commit**
`git add src/components/SettingsModal.tsx src/components/__tests__/SettingsModalAi.test.tsx && git commit -m "feat(ui): add AI category to Settings modal with multi-provider controls"`

---

### Task 6: Interactive Diff Card Component

**Files:**
- Create: `src/components/AiDiffCard.tsx`
- Test: `src/components/__tests__/AiDiffCard.test.tsx`

**Interfaces:**
- Consumes: `FileDiffResult` from `src/ai/diffUtils.ts`.
- Produces:
  ```typescript
  export interface AiDiffCardProps {
    diff: FileDiffResult;
    status: 'pending_approval' | 'accepted' | 'rejected';
    onAccept: () => void;
    onReject: () => void;
  }
  export const AiDiffCard: React.FC<AiDiffCardProps>;
  ```

- [ ] **Step 1: Write failing test for AiDiffCard**
Create `src/components/__tests__/AiDiffCard.test.tsx` testing render of filename, additions count (+N), deletions count (-N), collapsible diff viewer, and Accept/Reject clicks.
- [ ] **Step 2: Run test to verify it fails**
Run `npx vitest run src/components/__tests__/AiDiffCard.test.tsx`.
- [ ] **Step 3: Implement `src/components/AiDiffCard.tsx`**
Style with IntelliJ dark/light borders and colors (`#3574f0`, `#468a49`, `#c75450`), showing clear diff view and action buttons.
- [ ] **Step 4: Run test to verify it passes**
Run `npx vitest run src/components/__tests__/AiDiffCard.test.tsx`.
- [ ] **Step 5: Commit**
`git add src/components/AiDiffCard.tsx src/components/__tests__/AiDiffCard.test.tsx && git commit -m "feat(ui): implement interactive Prism-style AiDiffCard component"`

---

### Task 7: AI Chat Panel (Multi-Session Tool Window)

**Files:**
- Create: `src/components/AiChatPanel.tsx`
- Test: `src/components/__tests__/AiChatPanel.test.tsx`

**Interfaces:**
- Consumes: `AgentClient`, `AiDiffCard`, `useWorkspace`.
- Produces:
  ```typescript
  export interface AiChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    workspace: WorkspaceState;
    activeProvider?: AIProviderConfig | null;
    onOpenSettings: () => void;
  }
  export const AiChatPanel: React.FC<AiChatPanelProps>;
  ```

- [ ] **Step 1: Write failing test for AiChatPanel**
Create `src/components/__tests__/AiChatPanel.test.tsx` testing New Chat creation, session switching, message submission, markdown rendering, and diff card interactions.
- [ ] **Step 2: Run test to verify it fails**
Run `npx vitest run src/components/__tests__/AiChatPanel.test.tsx`.
- [ ] **Step 3: Implement `src/components/AiChatPanel.tsx`**
Build the IntelliJ-style tool window with header, chat session dropdown, New Chat button, message list, diff card embed, and prompt textarea with Enter/Shift+Enter.
- [ ] **Step 4: Run test to verify it passes**
Run `npx vitest run src/components/__tests__/AiChatPanel.test.tsx`.
- [ ] **Step 5: Commit**
`git add src/components/AiChatPanel.tsx src/components/__tests__/AiChatPanel.test.tsx && git commit -m "feat(ui): implement multi-session AiChatPanel tool window"`

---

### Task 8: Main Workspace Integration & Full Verification

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ProjectTopBar.tsx`
- Test: `src/__tests__/workflow.test.ts`

**Interfaces:**
- Connects: `AiChatPanel` to Activity Bar rail (Sparkles icon, `Alt+7`), resizable PanelGroup, and `useWorkspace` actions.

- [ ] **Step 1: Add AI Assistant trigger to IntelliJ Activity Bar in `src/App.tsx`**
Add Sparkle / Bot icon button with active highlight and `Alt+7` keyboard shortcut to open/close AI Chat panel in the resizable panel group.
- [ ] **Step 2: Wire `AiChatPanel` into workspace layout**
Render `AiChatPanel` as a resizable tool window with zero-space dismissal when closed.
- [ ] **Step 3: Run full Vitest test suite**
Run `npm test` and ensure all test suites pass with 0 failures.
- [ ] **Step 4: Run static build**
Run `npm run build` and ensure Next.js static export succeeds without errors.
- [ ] **Step 5: Run Cargo test suite**
Run `cargo test --manifest-path src-tauri/Cargo.toml` and ensure all Rust tests pass with 0 failures.
- [ ] **Step 6: Commit**
`git add src/App.tsx src/components/ProjectTopBar.tsx && git commit -m "feat(workspace): integrate AI chat tool window into workspace layout and activity bar"`
