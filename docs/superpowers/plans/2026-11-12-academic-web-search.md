# Academic & Web Search Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automated academic and web search tools (`torque_search_academic`, `torque_search_web`) in Torque with zero-key defaults (arXiv, Semantic Scholar, DuckDuckGo), optional premium search upgrades (Tavily, Brave), and parity across the embedded AI co-author and MCP server.

**Architecture:** Core search logic in TypeScript (`src/ai/searchService.ts`) with dual-mode execution (direct Webview fetch in Tauri Desktop, proxied via Next.js `/api/search/*` and `scripts/compiler-server.js` in Web mode). Tool schemas in `src/ai/tools.ts`, integration into `AgentClient` and `buildWorkspaceSystemPrompt`, UI settings in `SettingsModal.tsx`, and MCP parity in `scripts/compiler-server.js`.

**Tech Stack:** TypeScript, Next.js 16 App Router, Node.js HTTP, Vitest, Tailwind CSS, Lucide icons, Rust (Cargo).

**Spec:** [`docs/superpowers/specs/2026-11-12-academic-web-search-design.md`](file:///home/mugdho/codes/torque/docs/superpowers/specs/2026-11-12-academic-web-search-design.md)

## Global Constraints

- Native TeX Live & clean architecture invariants from `MAP.md` and `AGENTS.md`.
- Zero-key default for academic search: arXiv and Semantic Scholar must work without requiring API keys.
- Free web search must work out of the box with optional upgrade if Tavily/Brave key is provided.
- Next.js static export compatibility: dynamic proxy endpoints must also exist in `scripts/compiler-server.js`.
- All tests must pass: `npm test`, `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml`.

## Review Focus

1. **arXiv Atom XML Malformed/Empty Results**: When arXiv query returns 0 entries or malformed XML, searchService must return an empty list `[]` instead of throwing an unhandled exception.
2. **BibTeX Key Collision & Clean Escaping**: Generated BibTeX keys and author lists must sanitize special characters (`{`, `}`, `\`, `"`, accented characters) so compiling LaTeX documents never crashes.
3. **Semantic Scholar Rate Limiting / 429**: If Semantic Scholar returns 429 or network failure, gracefully fall back to arXiv without failing the entire tool call.
4. **Desktop vs Web Dual-Environment Fetch**: Ensure searchService seamlessly detects environment and avoids CORS errors in browser while using direct fetch in Tauri.
5. **Settings Persistence Across Reloads**: Search provider selection and optional API key must persist in `AISettings` (`~/.torque/ai_config.json`) and reload cleanly on application startup.

---

### Task 1: Search Types and Tool Schemas

**Files:**
- Modify: `src/types/ai.ts`
- Modify: `src/ai/tools.ts`
- Create: `src/ai/__tests__/tools.test.ts`

- [ ] **Step 1: Write tests for search tool definitions**
  Create `src/ai/__tests__/tools.test.ts` verifying that `torque_search_academic` and `torque_search_web` are present in `WORKSPACE_TOOLS_SCHEMA`, possess valid JSON schema properties (`query`, `source`, `maxResults`), and require `query`.
- [ ] **Step 2: Update AI types in `src/types/ai.ts`**
  Add `SearchSettings` interface (`provider: 'free' | 'tavily' | 'brave'`, `apiKey?: string`, `academicSource?: 'all' | 'arxiv' | 'semanticscholar'`) and extend `AISettings` with optional `search?: SearchSettings`. Define `AcademicSearchResult` and `WebSearchResult`.
- [ ] **Step 3: Add search tool definitions to `src/ai/tools.ts`**
  Add `torque_search_academic` and `torque_search_web` to `WORKSPACE_TOOLS_SCHEMA`.
- [ ] **Step 4: Run tests**
  Run `npx vitest run src/ai/__tests__/tools.test.ts` to confirm tests pass.
- [ ] **Step 5: Commit**
  Commit as `feat(ai): define academic and web search schemas in WORKSPACE_TOOLS_SCHEMA`.

---

### Task 2: Core Search Service Implementation (`searchService.ts`)

**Files:**
- Create: `src/ai/searchService.ts`
- Create: `src/ai/__tests__/searchService.test.ts`

- [ ] **Step 1: Write unit tests for search service**
  Create `src/ai/__tests__/searchService.test.ts` testing:
  - `searchArxiv(query, maxResults)` parses Atom XML, formats paper title, authors, year, abstract, and valid BibTeX.
  - `searchSemanticScholar(query, maxResults)` extracts paper details and BibTeX.
  - `searchAcademic(query, options)` handles source filtering (`'all' | 'arxiv' | 'semanticscholar'`) and merges/deduplicates results.
  - `searchWeb(query, settings)` returns snippet results (free fallback or Tavily/Brave if key provided).
  - Error handling when network or parsing fails (returns empty list or formatted error message).
- [ ] **Step 2: Implement arXiv XML parser & BibTeX generator**
  In `src/ai/searchService.ts`, implement an XML extractor for arXiv feed entries that formats standard BibTeX records with sanitize keys (`authorYYYYfirstword`).
- [ ] **Step 3: Implement Semantic Scholar query & fallback**
  In `src/ai/searchService.ts`, implement fetch to Semantic Scholar Graph API.
- [ ] **Step 4: Implement Web search (Free DuckDuckGo/Wikipedia & Tavily/Brave)**
  In `src/ai/searchService.ts`, implement free instant answer scraping and Tavily/Brave API client based on `SearchSettings`.
- [ ] **Step 5: Run tests**
  Run `npx vitest run src/ai/__tests__/searchService.test.ts` and ensure all tests pass.
- [ ] **Step 6: Commit**
  Commit as `feat(ai): implement core academic and web search service`.

---

### Task 3: Backend Proxy Routes & Production Compiler Server Endpoints

**Files:**
- Create: `src/app/api/search/academic/route.ts`
- Create: `src/app/api/search/web/route.ts`
- Modify: `scripts/compiler-server.js`
- Create: `src/compiler/__tests__/searchEndpoints.test.ts`

- [ ] **Step 1: Write tests for search endpoints**
  Create `src/compiler/__tests__/searchEndpoints.test.ts` verifying HTTP POST/GET requests to `/api/search/academic` and `/api/search/web` return JSON results with proper CORS and error status handling.
- [ ] **Step 2: Implement Next.js App Router route handlers**
  Create `src/app/api/search/academic/route.ts` and `src/app/api/search/web/route.ts` invoking `searchAcademic` and `searchWeb` with query parameters.
- [ ] **Step 3: Implement endpoints in `scripts/compiler-server.js`**
  Add `/api/search/academic` and `/api/search/web` route matching in `scripts/compiler-server.js` for standalone production web mode.
- [ ] **Step 4: Run tests**
  Run `npx vitest run src/compiler/__tests__/searchEndpoints.test.ts` to confirm pass.
- [ ] **Step 5: Commit**
  Commit as `feat(api): add academic and web search backend proxy endpoints`.

---

### Task 4: AI Co-Author Integration (`AgentClient` & System Prompt)

**Files:**
- Modify: `src/ai/agentClient.ts`
- Modify: `src/components/AiChatPanel.tsx`
- Create: `src/ai/__tests__/agentClientSearch.test.ts`

- [ ] **Step 1: Write tests for search tool execution in `AgentClient`**
  Create `src/ai/__tests__/agentClientSearch.test.ts` testing:
  - `AgentClient` recognizes `torque_search_academic` tool call and invokes `searchAcademic`.
  - `AgentClient` recognizes `torque_search_web` tool call and invokes `searchWeb`.
  - Result status is marked as `'done'` and result text contains title, abstract, and BibTeX.
- [ ] **Step 2: Update `WorkspaceToolContext` and tool handler in `agentClient.ts`**
  Add optional `searchAcademic` and `searchWeb` handlers to `WorkspaceToolContext`.
  In `agentClient.ts`, add cases for `torque_search_academic` and `torque_search_web` in the tool execution switch.
- [ ] **Step 3: Update `buildWorkspaceSystemPrompt`**
  Instruct the AI assistant on when and how to call `torque_search_academic` and `torque_search_web`, and how to insert BibTeX into `.bib` files and `\cite{...}` in `.tex` files.
- [ ] **Step 4: Update `AiChatPanel.tsx` context**
  Pass search context handlers in `AiChatPanel.tsx` so tool calls resolve seamlessly.
- [ ] **Step 5: Run tests**
  Run `npx vitest run src/ai/__tests__/agentClientSearch.test.ts` and `npx vitest run src/ai/__tests__/agentClient.test.ts`.
- [ ] **Step 6: Commit**
  Commit as `feat(ai): integrate academic and web search tools into AgentClient co-author`.

---

### Task 5: Search Settings in SettingsModal

**Files:**
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/__tests__/SettingsModal.test.tsx`

- [ ] **Step 1: Write tests for Search Settings UI**
  In `src/components/__tests__/SettingsModal.test.tsx`, test rendering of the "Search Engine" section, provider selection dropdown, and Tavily/Brave API key input field.
- [ ] **Step 2: Implement Search Settings UI in `SettingsModal.tsx`**
  Add a search configuration section under the AI tab in `SettingsModal.tsx`:
  - Provider selection: `Free / Built-in`, `Tavily Search`, `Brave Search`.
  - API Key input (only visible when Tavily or Brave is selected).
  - Save button saves to `AISettings` via `saveAISettings()`.
- [ ] **Step 3: Run tests**
  Run `npx vitest run src/components/__tests__/SettingsModal.test.tsx`.
- [ ] **Step 4: Commit**
  Commit as `feat(ui): add search provider and API key settings to SettingsModal`.

---

### Task 6: MCP Server Search Parity & Final Verification

**Files:**
- Modify: `scripts/compiler-server.js`
- Modify: `src-tauri/src/mcp/catalog.rs`
- Modify: `src/compiler/__tests__/mcpServer.test.ts`

- [ ] **Step 1: Register tools in MCP catalog**
  In `scripts/compiler-server.js` and `src-tauri/src/mcp/catalog.rs`, register `torque_search_academic` and `torque_search_web`.
- [ ] **Step 2: Implement MCP tool handlers in `compiler-server.js`**
  Add tool execution dispatch for academic and web search in `scripts/compiler-server.js`.
- [ ] **Step 3: Run full verification suite**
  Run `npm test`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml`.
- [ ] **Step 4: Commit**
  Commit as `feat(mcp): add academic and web search tools to MCP server`.
