import { normalizeFilePath } from '../storage/pathUtils';
export type { AcademicSearchResult, WebSearchResult } from '../types/ai';

export interface OpenAIFunctionParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
}

export interface OpenAIFunctionParameters {
  type: 'object';
  properties: Record<string, OpenAIFunctionParameterProperty>;
  required?: string[];
}

export interface OpenAIFunctionDefinition {
  name: string;
  description: string;
  parameters: OpenAIFunctionParameters;
}

export interface OpenAIToolDefinition {
  type: 'function';
  function: OpenAIFunctionDefinition;
}

export const WORKSPACE_TOOLS_SCHEMA: OpenAIToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'torque_read_file',
      description: 'Read the contents of a file in the workspace with optional line range slicing.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path of the file to read within the workspace.',
          },
          startLine: {
            type: 'number',
            description: 'Optional 1-based start line number (inclusive).',
          },
          endLine: {
            type: 'number',
            description: 'Optional 1-based end line number (inclusive).',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'torque_write_file',
      description: 'Create a new file or completely overwrite an existing file in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path of the file to write within the workspace.',
          },
          content: {
            type: 'string',
            description: 'The full text content to write to the file.',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'torque_edit_file',
      description: 'Perform a targeted search-and-replace edit on a specific section of a file in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path of the file to edit.',
          },
          target: {
            type: 'string',
            description: 'The exact string or lines in the file to find and replace.',
          },
          replacement: {
            type: 'string',
            description: 'The replacement string or lines to substitute for target.',
          },
        },
        required: ['path', 'target', 'replacement'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'torque_compile',
      description: 'Compile the LaTeX document project using the specified or default TeX engine.',
      parameters: {
        type: 'object',
        properties: {
          engine: {
            type: 'string',
            enum: ['pdflatex', 'xelatex', 'lualatex'],
            description: 'Optional TeX compilation engine to use.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'torque_get_diagnostics',
      description: 'Retrieve compiler diagnostics, errors, warnings, and missing package information from the latest compilation.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'torque_search_academic',
      description: 'Search academic papers on arXiv and Semantic Scholar to find citations, literature, and BibTeX entries.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query, topic, author, or research question.',
          },
          source: {
            type: 'string',
            enum: ['all', 'arxiv', 'semanticscholar'],
            description: 'Academic source to query (all, arxiv, or semanticscholar). Defaults to all.',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of paper results to return (default: 5, max: 10).',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'torque_search_web',
      description: 'Search the web for LaTeX documentation, package usage, coding questions, or real-time information.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The web search query.',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of web search results to return (default: 5).',
          },
        },
        required: ['query'],
      },
    },
  },
];

/**
 * Validates and normalizes a relative file path provided to a workspace tool.
 * Throws an error if path is empty, invalid, or attempts parent traversal (`..`).
 */
export function validateToolPath(path: string): string {
  return normalizeFilePath(path);
}

/**
 * Unwraps nested argument structures (e.g. `args.params`, `args.arguments`, `args.input`)
 * commonly produced by LLMs or different tool calling schemas.
 */
export function unwrapToolArgs(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const obj = raw as Record<string, unknown>;
  if (obj.params && typeof obj.params === 'object' && !Array.isArray(obj.params)) {
    return unwrapToolArgs(obj.params);
  }
  if (typeof obj.arguments === 'string') {
    try {
      const parsed = JSON.parse(obj.arguments);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return unwrapToolArgs(parsed);
      }
    } catch {
      // not JSON string
    }
  }
  if (obj.arguments && typeof obj.arguments === 'object' && !Array.isArray(obj.arguments)) {
    return unwrapToolArgs(obj.arguments);
  }
  if (obj.input && typeof obj.input === 'object' && !Array.isArray(obj.input)) {
    return unwrapToolArgs(obj.input);
  }
  return obj;
}

const PATH_KEYS = [
  'path',
  'filePath',
  'filepath',
  'filename',
  'fileName',
  'file',
  'targetPath',
  'relPath',
  'relative_path',
  'Path',
  'FilePath',
];

const CONTENT_KEYS = [
  'content',
  'code',
  'text',
  'contents',
  'data',
  'Content',
  'Code',
];

const TARGET_KEYS = [
  'target',
  'find',
  'search',
  'original',
  'oldText',
  'old_text',
  'Target',
];

const REPLACEMENT_KEYS = [
  'replacement',
  'replace',
  'substitute',
  'newText',
  'new_text',
  'Replacement',
];

const QUERY_KEYS = [
  'query',
  'q',
  'search',
  'prompt',
  'Query',
];

/**
 * Extracts a normalized workspace file path from alternative argument keys or nested payloads.
 * Falls back to `fallbackPath` (e.g. active file) if candidate is missing or empty.
 */
export function extractToolPath(args: unknown, fallbackPath?: string): string {
  const unwrapped = unwrapToolArgs(args);
  for (const key of PATH_KEYS) {
    const val = unwrapped[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return validateToolPath(val);
    }
  }

  if (fallbackPath && typeof fallbackPath === 'string' && fallbackPath.trim().length > 0) {
    return validateToolPath(fallbackPath);
  }

  throw new Error('Invalid path: path must be a non-empty string');
}

/**
 * Extracts content from alternative argument keys (content, code, text, contents, data, etc.).
 */
export function extractToolContent(args: unknown): string {
  const unwrapped = unwrapToolArgs(args);
  for (const key of CONTENT_KEYS) {
    const val = unwrapped[key];
    if (typeof val === 'string') {
      return val;
    }
    if (typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }
  }
  throw new Error('Missing required parameter: content');
}

/**
 * Extracts target and replacement strings for surgical file editing.
 */
export function extractToolEditTargets(args: unknown): { target: string; replacement: string } {
  const unwrapped = unwrapToolArgs(args);

  let target: string | undefined;
  for (const key of TARGET_KEYS) {
    const val = unwrapped[key];
    if (typeof val === 'string') {
      target = val;
      break;
    }
    if (typeof val === 'number') {
      target = String(val);
      break;
    }
  }

  let replacement: string | undefined;
  for (const key of REPLACEMENT_KEYS) {
    const val = unwrapped[key];
    if (typeof val === 'string') {
      replacement = val;
      break;
    }
    if (typeof val === 'number' || typeof val === 'boolean') {
      replacement = String(val);
      break;
    }
  }

  if (target === undefined || target === null) {
    throw new Error('Missing required parameter: target');
  }
  if (target.length === 0) {
    throw new Error("Argument 'target' cannot be empty");
  }
  if (replacement === undefined || replacement === null) {
    throw new Error('Missing required parameter: replacement');
  }

  return { target, replacement };
}

/**
 * Extracts search query from alternative keys (query, q, search, prompt, Query).
 */
export function extractToolQuery(args: unknown): string {
  const unwrapped = unwrapToolArgs(args);
  for (const key of QUERY_KEYS) {
    const val = unwrapped[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  throw new Error('Search query is required');
}

