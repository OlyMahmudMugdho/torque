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
