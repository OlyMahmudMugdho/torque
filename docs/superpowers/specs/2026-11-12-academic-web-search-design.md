# Automated Academic & Web Search Subsystem Design

**Date**: 2026-11-12  
**Status**: Proposed  
**Author**: Torque Core Team  

---

## 1. Intent & The Why

Torque is designed for LaTeX authors, academics, and researchers. A critical workflow in scientific writing is literature review, paper citation, and fact-checking. Currently, Torque's embedded AI co-author can only inspect and edit local files in the workspace. Authors must manually leave the editor, search Google Scholar or arXiv in a browser, copy BibTeX strings, switch back to Torque, paste them into `.bib` files, and construct `\cite{...}` commands.

By providing **automated academic and web search tools** to Torque's AI assistant and MCP server, the co-author can:
1. Search arXiv and Semantic Scholar directly from a prompt (e.g. *"Find recent papers on diffusion models for protein folding and add citations to references.bib"*).
2. Retrieve structured metadata (titles, authors, publication years, abstracts, and verified BibTeX records).
3. Append citations into `.bib` files and insert corresponding `\cite{...}` commands into LaTeX files with full interactive diff approval.
4. Perform web queries for LaTeX package documentation, syntax checks, and real-time facts.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Automated AI Tool Calling**: Expose `torque_search_academic` and `torque_search_web` function definitions to Torque's AI co-author (`AgentClient`).
- **Zero-Key Default Academic Search**: Query arXiv (Atom XML API) and Semantic Scholar Graph API without requiring any user API key or configuration.
- **Ready-to-Use BibTeX Output**: Academic search returns accurate, formatted BibTeX entries so the AI can cleanly append them to `.bib` files.
- **Zero-Key Default Web Search**: DuckDuckGo / Wikipedia summaries work out of the box with zero setup.
- **Optional Premium Web Search Upgrade**: Allow users to optionally input a Tavily or Brave Search API key in Settings for deep web page retrieval.
- **Dual Runtime Support**: Run without CORS issues in Next.js web mode (via API route) and in Tauri desktop mode (via native IPC / HTTP client).
- **Torque MCP Server Parity**: Expose these search tools in the embedded MCP server (`src-tauri/src/mcp/` and `scripts/compiler-server.js`) so external LLM clients enjoy the same search capabilities.

### Non-Goals
- **Replacing Reference Managers**: Torque is not replacing full reference managers like Zotero or Mendeley (e.g., no PDF attachment cataloging or cloud sync).
- **Automated Unsupervised File Overwrites**: All file changes made with retrieved citations still pass through Torque's interactive diff inspection (`AiDiffCard`).

### Anti-Goals
- **Hard Paywalls / Mandatory API Keys**: Never block users from using academic search because they lack an API key.
- **Heavy Local Indexing**: Do not download multi-gigabyte paper corpora or embedding databases locally.

---

## 3. Constraints
- **CORS Restrictions**: In browser/dev mode, direct client-side calls to certain endpoints can fail due to browser CORS policies. All external search queries must route through Next.js proxy endpoints (`/api/search/academic`, `/api/search/web`) or Tauri IPC.
- **Strict Invariants**: All modifications must pass `npm test`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml`.
- **Aesthetic Consistency**: Any new settings UI must adhere to IntelliJ IDEA Darcula/Light styling.

---

## 4. Approaches Considered

1. **Approach 1: Zero-Key Built-in Search Only (Free Only)**
   - Only support arXiv and DuckDuckGo. No settings or API key fields.
   - *Trade-off*: Zero setup, but web search quality is limited to short snippets.
2. **Approach 2: Pure API-Key Provider (Tavily/Brave Only)**
   - Require users to enter search API keys before any search works.
   - *Trade-off*: Highest quality web search, but introduces friction and breaks out-of-the-box experience.
3. **Approach 3: Hybrid Default-Free with Optional API Key Upgrade (Selected)**
   - arXiv and Semantic Scholar work with zero configuration.
   - Free web search (DuckDuckGo/Wikipedia) works with zero configuration.
   - Users can optionally provide a Tavily or Brave Search API key in Settings to unlock deep web search.
   - Tools are unified across the embedded AI co-author and the MCP server.

---

## 5. Architectural Specification

### 5.1 Tool Definitions (`src/ai/tools.ts`)

```typescript
export interface AcademicSearchResult {
  title: string;
  authors: string[];
  year: number | string;
  abstract: string;
  url: string;
  citationKey: string;
  bibtex: string;
  source: 'arxiv' | 'semanticscholar';
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}
```

Two new function definitions in `WORKSPACE_TOOLS_SCHEMA`:
1. `torque_search_academic`:
   - `query` (string, required): Title, author, keywords, or research question.
   - `source` (string, optional: `'all' | 'arxiv' | 'semanticscholar'`, default `'all'`).
   - `maxResults` (number, optional, default 5, max 10).
2. `torque_search_web`:
   - `query` (string, required): Search query.
   - `maxResults` (number, optional, default 5).

### 5.2 Search Engine Providers (`src/ai/searchService.ts`)

1. **arXiv Provider**:
   - URL: `https://export.arxiv.org/api/query?search_query=all:<query>&start=0&max_results=<limit>`
   - Parses Atom XML feed in TypeScript.
   - Generates clean BibTeX:
     ```bibtex
     @article{authorYYYYslug,
       title = {<title>},
       author = {<authors>},
       journal = {arXiv preprint arXiv:<id>},
       year = {<year>},
       eprint = {<id>},
       archivePrefix = {arXiv},
       url = {https://arxiv.org/abs/<id>}
     }
     ```
2. **Semantic Scholar Provider**:
   - URL: `https://api.semanticscholar.org/graph/v1/paper/search?query=<query>&limit=<limit>&fields=title,authors,year,abstract,citationStyles,url,externalIds`
   - Extracts pre-generated `citationStyles.bibtex` or synthesizes BibTeX if missing.
3. **Web Search Provider**:
   - Default: DuckDuckGo instant-answer and HTML summary scraper.
   - Upgraded: If `search` in `AISettings` configures Tavily or Brave Search with an API key:
     - Tavily: `POST https://api.tavily.com/search`
     - Brave: `GET https://api.brave.com/res/v1/web/search`

### 5.3 Runtime Architecture & Backend Endpoints
- **Desktop (Tauri)**: In Tauri desktop, the webview runs with unrestricted CSP (`csp: null`), enabling direct `fetch()` calls to arXiv, Semantic Scholar, Tavily, and Brave directly in TypeScript without CORS proxy overhead.
- **Web / Dev Mode (`next dev`)**: App Router API routes at `src/app/api/search/academic/route.ts` and `src/app/api/search/web/route.ts` proxy external requests when running in browser mode.
- **Production Web Mode (`scripts/compiler-server.js`)**: Endpoints `/api/search/academic` and `/api/search/web` are mirrored inside `scripts/compiler-server.js` to ensure static production builds (`output: 'export'`) have full search proxy support.
- **MCP Server Parity**: Tool definitions and execution handlers for `torque_search_academic` and `torque_search_web` are integrated into `scripts/compiler-server.js` (and registered in `src-tauri/src/mcp/` catalog).

### 5.4 Search Settings Authority
Search settings are stored authoritatively in `AISettings` under `~/.torque/ai_config.json` via the existing `loadAISettings()` / `saveAISettings()` infrastructure:
```typescript
export interface SearchSettings {
  provider: 'free' | 'tavily' | 'brave';
  apiKey?: string;
}

export interface AISettings {
  providers: AIProviderConfig[];
  activeProviderId: string | null;
  search?: SearchSettings;
}
```

### 5.5 AI Prompting & Co-Author Workflow
Update `buildWorkspaceSystemPrompt` in `src/ai/agentClient.ts`:
- Instruct the assistant that it has live access to `torque_search_academic` and `torque_search_web`.
- Advise the model:
  1. When asked for literature or citations, run `torque_search_academic`.
  2. Parse the returned BibTeX.
  3. Use `torque_edit_file` to add the BibTeX to the project's `.bib` file (or `torque_write_file` if none exists).
  4. Use `torque_edit_file` to insert `\cite{citationKey}` in the relevant `.tex` file.

### 5.6 Settings UI
In `SettingsModal.tsx`, add a "Search Engine" section within the AI tab:
- Provider dropdown: `Built-in Free (DuckDuckGo + arXiv/Semantic Scholar)`, `Tavily Search`, `Brave Search`.
- Optional API Key input (visible when Tavily or Brave is selected).
- Saves directly to `AISettings` via `saveAISettings()`.

---

## 6. What's Left to the Builder
- Detailed Atom XML parser implementation for arXiv response.
- Fallback BibTeX generation for papers without native BibTeX from Semantic Scholar.
- Unit tests for search result formatting, query dispatching, and mock API responses.
- Interactive diff card presentation when AI proposes appending `.bib` entries.
