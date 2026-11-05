# Design Document: AI LaTeX Assistant & OpenAI-Compatible Chat with Diff Review

## 1. Intent & Context
Torque is a high-performance LaTeX IDE featuring IntelliJ IDEA aesthetics, native TeX Live execution, automated CTAN package resolution, and Tauri desktop integration.

This project introduces an integrated AI Assistant chat subsystem into Torque. Inspired by the interaction model of OpenAI Prism, researchers and authors can collaborate with an AI co-author powered by any OpenAI-compatible model (OpenAI, Anthropic via proxy, Groq, Ollama, LM Studio, OpenRouter, vLLM, etc.). The AI has access to workspace tools to inspect files, execute compilations, read diagnostics, and propose file modifications. To preserve document integrity and author control, proposed changes are presented as interactive diffs that require explicit user acceptance or rejection before applying to the project files.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Multi-Session AI Chat Interface**: Provide a dedicated IntelliJ-style tool window for managing multiple concurrent or historical chat conversations per project.
- **OpenAI-Compatible Multi-Provider Settings**: Introduce an "AI" settings section supporting multiple provider profiles, custom base URLs, API keys, and model selection.
- **Secure Local Credential Persistence**: Store AI provider configurations and credentials in the user's home directory under `~/.torque/ai_config.json` via Tauri IPC (with browser storage fallback in web environments).
- **Backend LLM Integration with `langchain-rust`**: Power the desktop backend LLM orchestration and streaming in Rust using `langchain-rust`.
- **Tool-Augmented Project Operations**: Expose core project operations (`read_file`, `edit_file`, `write_file`, `compile`, `get_diagnostics`) as OpenAI-compatible function calling tools.
- **Prism-Style Diff & Review Workflow**: Present proposed edits as visual diff cards in the chat feed with options to view diffs and explicitly Accept or Reject changes before applying them to project files.
- **CORS-Free Connectivity**: Route completions through the native Tauri Rust backend in desktop mode so users can seamlessly connect to local LLMs (such as Ollama or LM Studio) without CORS blocking.

### Non-Goals
- Proprietary or model-specific lock-in (must adhere strictly to OpenAI Chat Completions API format).
- Autonomous silent code editing (no destructive edits applied without explicit user approval).
- Cloud synchronization of credentials (all keys remain strictly local in `~/.torque`).

### Anti-Goals
- Cluttering the editor with modal popups for every minor read action (read/compile tools should run cleanly, only file mutations require diff approval).
- Blocking UI responsiveness during long streaming or multi-turn agent execution loops.

---

## 3. Constraints & Architectural Invariants
- **IntelliJ IDEA New UI Design Language**: Chat tool window, icons, status indicators, and settings inputs must strictly match JetBrains aesthetics (Darcula `#2b2d30` / `#1e1f22`, Light `#ffffff` / `#ebecf0`, accents `#3574f0`).
- **Semantic Versioning & Architecture Invariants**: Strictly follow rules from `AGENTS.md` and `MAP.md`.
- **Zero Persistent Margin Footprint**: When chat window or diagnostics panels are collapsed, they must collapse to 0 width/height without dead space.
- **Path Security**: All file operations invoked by tools must be validated through `normalizeFilePath` to block directory traversal attacks (`..`).

---

## 4. Evaluated Approaches & Selection

### Approach 1: Hybrid Architecture (Tauri Credential & `langchain-rust` Network Bridge + Reactive Frontend Agent Loop) — *SELECTED*
- **Description**: Tauri backend provides IPC commands (`get_ai_config`, `save_ai_config`) to persist provider definitions in `~/.torque/ai_config.json`. Rust uses `langchain-rust` to configure OpenAI-compatible clients (custom base URL, auth token, model parameters) and stream chat completions (`tauri_ai_chat_stream`), bypassing browser CORS for local models. The reactive agent loop, tool dispatch, and diff state machine reside in TypeScript (`src/ai/`), directly integrated with `useWorkspace`.
- **Trade-offs**: Clean separation; keeps editor buffers in sync; zero CORS issues; responsive.
- **Selection Reason**: Chosen because it provides reliable connectivity for both remote APIs and local LLMs via `langchain-rust` while keeping tool execution and Monaco editor diff reviews fast and reactive.

### Approach 2: Full Frontend Client-Side Architecture
- **Description**: Frontend executes all API calls via `fetch()` directly from browser/webview.
- **Trade-offs**: Simple to write, but local LLM servers (Ollama, LM Studio) fail due to webview CORS restrictions unless specifically reconfigured by the user.
- **Rejection Reason**: Unreliable user experience with local models.

### Approach 3: Fully Native Backend Agent (Rust-Owned Loop)
- **Description**: All provider communication, credentials, and multi-turn agent state live in Rust.
- **Trade-offs**: Decouples logic from React, but severely complicates live Monaco editor buffer synchronization, breaks web fallback, and duplicates workspace state.
- **Rejection Reason**: Excessive complexity and poor React integration.

---

## 5. Detailed Component & System Specification

### 5.1 AI Provider Settings (`src/components/SettingsModal.tsx` & `src/ai/aiConfig.ts`)
- **Category Navigation**: Add an `AI` category tab with a brain/sparkle icon to `SettingsModal.tsx`.
- **Provider Profile Model**:
  ```typescript
  export interface AIProviderConfig {
    id: string;              // uuid or slug
    name: string;            // e.g. "OpenAI", "Ollama Local", "OpenRouter"
    baseUrl: string;         // e.g. "https://api.openai.com/v1", "http://localhost:11434/v1"
    apiKey: string;          // Bearer token (optional for local models)
    selectedModel: string;   // e.g. "gpt-4o", "llama3.1:8b"
    availableModels: string[]; // populated manually or via /models endpoint
  }

  export interface AISettings {
    providers: AIProviderConfig[];
    activeProviderId: string | null;
  }
  ```
- **Connection Testing & Model Fetching**:
  - "Test Connection / Fetch Models" button calls `${baseUrl}/models` with the provided API key.
  - Populates model dropdown automatically with fallback to manual model text input.
- **Desktop Storage**:
  - Tauri IPC commands: `tauri_get_ai_config` and `tauri_save_ai_config`.
  - Persists directly to `~/.torque/ai_config.json` with permissions restricted to current user.
  - Web fallback: stores in `torque_ai_config` within IndexedDB/localStorage.

### 5.2 Tauri Native AI Bridge with `langchain-rust` (`src-tauri/src/ai.rs` & `src-tauri/src/lib.rs`)
- **Dependencies**: Integrates `langchain-rust` in `src-tauri/Cargo.toml` for OpenAI-compatible model interaction.
- **Commands**:
  - `tauri_get_ai_config() -> Result<String, String>`: Reads `~/.torque/ai_config.json`.
  - `tauri_save_ai_config(config_json: String) -> Result<(), String>`: Writes `~/.torque/ai_config.json`.
  - `tauri_ai_chat_stream(request: ChatCompletionRequest, channel: Channel<ChatStreamChunk>)`: Uses `langchain-rust` OpenAI client configured with custom `base_url`, `api_key`, and `model`, streaming tokens and tool calls back to the frontend.

### 5.3 Workspace Tools Definition (`src/ai/tools.ts`)
Expose 5 core tools matching the OpenAI function calling schema:
1. `torque_read_file({ path: string, start_line?: number, end_line?: number })`: Reads file contents with optional line slicing.
2. `torque_write_file({ path: string, content: string })`: Creates or replaces a file (requires diff approval).
3. `torque_edit_file({ path: string, target: string, replacement: string })`: Surgical search-and-replace (requires diff approval).
4. `torque_compile({ engine?: "pdflatex" | "xelatex" | "lualatex" })`: Triggers project compilation.
5. `torque_get_diagnostics()`: Returns compiler errors, warnings, and missing packages.

### 5.4 Prism-Style Diff & Review Workflow (`src/ai/diffUtils.ts` & `src/components/AiDiffCard.tsx`)
- When `torque_edit_file` or `torque_write_file` is called:
  1. The agent computes the resulting text from the current workspace file content.
  2. Generates a unified diff using line-by-line diffing.
  3. Halts tool execution and puts the message in `status: "pending_approval"`.
  4. Renders `AiDiffCard` in the chat thread showing:
     - Target file path badge.
     - Additions count (`+N` in green), Deletions count (`-M` in red).
     - Expandable diff view with color-coded syntax lines (`+` green bg, `-` red bg).
     - **Accept** button (green) and **Reject** button (subtle gray/red).
  5. **On Accept**:
     - Writes the patched content to the workspace file via `workspace.updateActiveFileContent` or `workspace.createFile`.
     - Marks the diff card as `accepted`.
     - Submits `{ status: "success", message: "Changes accepted and applied by user." }` as the tool call result back to the model.
     - Resumes the agent loop.
  6. **On Reject**:
     - Leaves file untouched.
     - Marks the diff card as `rejected`.
     - Submits `{ status: "rejected", message: "User rejected the proposed changes." }` back to the model.
     - Resumes the agent loop.

### 5.5 AI Chat Tool Window (`src/components/AiChatPanel.tsx` & `src/App.tsx`)
- **Docking & Layout**:
  - Added to the IntelliJ left activity bar with a Sparkles / Bot icon (`Alt+7` shortcut).
  - Can be toggled open as a resizable panel adjacent to the FileTreeSidebar or docked on the right side next to the PDF preview.
- **Session Management**:
  - "New Chat" button creates a fresh conversation.
  - Dropdown / drawer showing past chat sessions for the active project.
  - Sessions persist in project storage (`~/.torque/projects/<id>/chats.json` or IndexedDB).
- **Conversation Feed**:
  - Renders user messages, assistant responses, markdown formatting, LaTeX formulas, tool status badges, and interactive `AiDiffCard` components.
  - Auto-scroll with user manual override.
  - Input box with Send (`Enter`), multiline (`Shift+Enter`), and Stop Generation button.

---

## 6. What's Left to the Builder (Settled Calls)
- **Monaco editor highlighting**: In addition to the chat diff card, the editor optionally highlights modified lines after acceptance.
- **System prompt**: Default system prompt instructs the assistant to specialize in LaTeX typesetting, BibTeX/biber bibliography, and math environments.
- **Session history storage**: Stored per project as `chats.json` within each project's storage directory.

---

## 7. Verification & Testing Plan
- **Unit Tests**:
  - `aiConfig.test.ts`: Loading and saving AI configurations, active provider switching, fallback handling.
  - `diffUtils.test.ts`: Computing diffs, line additions/deletions counts, patch applications.
  - `tools.test.ts`: Verifying OpenAI tool schema declarations and argument parsers.
  - `AiChatPanel.test.tsx`: Rendering chat messages, new chat creation, diff card accept/reject interactions.
  - `SettingsModal.test.tsx`: Verifying new AI category, provider form inputs, credential fields.
- **Cargo Tests**:
  - Rust test suite for `ai_config` file persistence, `langchain-rust` integration, and path normalization.
- **Full Suite Verification**:
  - `npm test` passes with zero errors.
  - `npm run build` succeeds cleanly.
  - `cargo test --manifest-path src-tauri/Cargo.toml` succeeds cleanly.
