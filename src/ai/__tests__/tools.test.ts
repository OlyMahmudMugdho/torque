import { describe, it, expect } from 'vitest';
import {
  WORKSPACE_TOOLS_SCHEMA,
  validateToolPath,
  extractToolPath,
  extractToolContent,
  extractToolEditTargets,
  extractToolQuery,
} from '../tools';

describe('tools', () => {
  describe('WORKSPACE_TOOLS_SCHEMA', () => {
    it('defines an array of 7 OpenAI-compatible tool specifications', () => {
      expect(Array.isArray(WORKSPACE_TOOLS_SCHEMA)).toBe(true);
      expect(WORKSPACE_TOOLS_SCHEMA).toHaveLength(7);
      for (const tool of WORKSPACE_TOOLS_SCHEMA) {
        expect(tool.type).toBe('function');
        expect(tool.function).toBeDefined();
        expect(typeof tool.function.name).toBe('string');
        expect(typeof tool.function.description).toBe('string');
        expect(tool.function.parameters).toBeDefined();
        expect(tool.function.parameters.type).toBe('object');
      }
    });

    it('contains torque_read_file schema with path, startLine, and endLine', () => {
      const tool = WORKSPACE_TOOLS_SCHEMA.find((t) => t.function.name === 'torque_read_file');
      expect(tool).toBeDefined();
      const params = tool?.function.parameters;
      expect(params?.properties?.path).toBeDefined();
      expect(params?.properties?.path.type).toBe('string');
      expect(params?.properties?.startLine).toBeDefined();
      expect(params?.properties?.startLine.type).toBe('number');
      expect(params?.properties?.endLine).toBeDefined();
      expect(params?.properties?.endLine.type).toBe('number');
      expect(params?.required).toContain('path');
    });

    it('contains torque_write_file schema with path and content', () => {
      const tool = WORKSPACE_TOOLS_SCHEMA.find((t) => t.function.name === 'torque_write_file');
      expect(tool).toBeDefined();
      const params = tool?.function.parameters;
      expect(params?.properties?.path).toBeDefined();
      expect(params?.properties?.path.type).toBe('string');
      expect(params?.properties?.content).toBeDefined();
      expect(params?.properties?.content.type).toBe('string');
      expect(params?.required).toEqual(expect.arrayContaining(['path', 'content']));
    });

    it('contains torque_edit_file schema with path, target, and replacement', () => {
      const tool = WORKSPACE_TOOLS_SCHEMA.find((t) => t.function.name === 'torque_edit_file');
      expect(tool).toBeDefined();
      const params = tool?.function.parameters;
      expect(params?.properties?.path).toBeDefined();
      expect(params?.properties?.target).toBeDefined();
      expect(params?.properties?.replacement).toBeDefined();
      expect(params?.required).toEqual(expect.arrayContaining(['path', 'target', 'replacement']));
    });

    it('contains torque_compile schema with optional engine enum', () => {
      const tool = WORKSPACE_TOOLS_SCHEMA.find((t) => t.function.name === 'torque_compile');
      expect(tool).toBeDefined();
      const params = tool?.function.parameters;
      expect(params?.properties?.engine).toBeDefined();
      expect(params?.properties?.engine.enum).toEqual(['pdflatex', 'xelatex', 'lualatex']);
      expect(params?.required ?? []).not.toContain('engine');
    });

    it('contains torque_get_diagnostics schema with no required parameters', () => {
      const tool = WORKSPACE_TOOLS_SCHEMA.find((t) => t.function.name === 'torque_get_diagnostics');
      expect(tool).toBeDefined();
      const params = tool?.function.parameters;
      expect(params?.required ?? []).toHaveLength(0);
    });

    it('contains torque_search_academic schema with query, source, and maxResults', () => {
      const tool = WORKSPACE_TOOLS_SCHEMA.find((t) => t.function.name === 'torque_search_academic');
      expect(tool).toBeDefined();
      const params = tool?.function.parameters;
      expect(params?.properties?.query).toBeDefined();
      expect(params?.properties?.query.type).toBe('string');
      expect(params?.properties?.source).toBeDefined();
      expect(params?.properties?.source.type).toBe('string');
      expect(params?.properties?.source.enum).toEqual(['all', 'arxiv', 'semanticscholar']);
      expect(params?.properties?.maxResults).toBeDefined();
      expect(params?.properties?.maxResults.type).toBe('number');
      expect(params?.required).toEqual(['query']);
    });

    it('contains torque_search_web schema with query and maxResults', () => {
      const tool = WORKSPACE_TOOLS_SCHEMA.find((t) => t.function.name === 'torque_search_web');
      expect(tool).toBeDefined();
      const params = tool?.function.parameters;
      expect(params?.properties?.query).toBeDefined();
      expect(params?.properties?.query.type).toBe('string');
      expect(params?.properties?.maxResults).toBeDefined();
      expect(params?.properties?.maxResults.type).toBe('number');
      expect(params?.required).toEqual(['query']);
    });
  });

  describe('validateToolPath', () => {
    it('normalizes valid relative paths cleanly', () => {
      expect(validateToolPath('main.tex')).toBe('main.tex');
      expect(validateToolPath('./chapters/intro.tex')).toBe('chapters/intro.tex');
      expect(validateToolPath('/sections/math.tex')).toBe('sections/math.tex');
      expect(validateToolPath('chapters//intro.tex')).toBe('chapters/intro.tex');
      expect(validateToolPath('\\windows\\path\\file.tex')).toBe('windows/path/file.tex');
    });

    it('rejects path traversal with parent directories', () => {
      expect(() => validateToolPath('../secret.tex')).toThrow(/parent traversal not allowed/i);
      expect(() => validateToolPath('chapters/../../etc/passwd')).toThrow(/parent traversal not allowed/i);
      expect(() => validateToolPath('..')).toThrow(/parent traversal not allowed/i);
    });

    it('rejects empty or whitespace-only paths', () => {
      expect(() => validateToolPath('')).toThrow(/empty path|non-empty string/i);
      expect(() => validateToolPath('   ')).toThrow(/empty path|non-empty string/i);
      expect(() => validateToolPath(null as any)).toThrow(/non-empty string/i);
    });
  });

  describe('extractToolPath', () => {
    it('extracts path from path, filePath, filename, etc.', () => {
      expect(extractToolPath({ path: 'main.tex' })).toBe('main.tex');
      expect(extractToolPath({ filePath: 'chapter1.tex' })).toBe('chapter1.tex');
      expect(extractToolPath({ filepath: 'intro.tex' })).toBe('intro.tex');
      expect(extractToolPath({ filename: 'ref.bib' })).toBe('ref.bib');
      expect(extractToolPath({ fileName: 'paper.tex' })).toBe('paper.tex');
      expect(extractToolPath({ file: 'table.tex' })).toBe('table.tex');
      expect(extractToolPath({ targetPath: 'sections/1.tex' })).toBe('sections/1.tex');
      expect(extractToolPath({ relPath: 'figures/plot.tex' })).toBe('figures/plot.tex');
      expect(extractToolPath({ relative_path: 'doc.tex' })).toBe('doc.tex');
      expect(extractToolPath({ Path: 'overview.tex' })).toBe('overview.tex');
      expect(extractToolPath({ FilePath: 'ack.tex' })).toBe('ack.tex');
    });

    it('unwraps nested parameters (params, arguments, input)', () => {
      expect(extractToolPath({ params: { filePath: 'nested.tex' } })).toBe('nested.tex');
      expect(extractToolPath({ arguments: { path: 'args.tex' } })).toBe('args.tex');
      expect(extractToolPath({ input: { filename: 'input.tex' } })).toBe('input.tex');
      expect(extractToolPath({ arguments: JSON.stringify({ path: 'json_str.tex' }) })).toBe('json_str.tex');
    });

    it('falls back to fallbackPath if candidate is missing or empty', () => {
      expect(extractToolPath({}, 'fallback.tex')).toBe('fallback.tex');
      expect(extractToolPath({ path: '' }, 'active.tex')).toBe('active.tex');
      expect(extractToolPath({ filePath: '   ' }, 'main.tex')).toBe('main.tex');
    });

    it('throws when path is missing and no valid fallback is provided', () => {
      expect(() => extractToolPath({})).toThrow(/non-empty string/i);
      expect(() => extractToolPath({ path: '' })).toThrow(/non-empty string/i);
      expect(() => extractToolPath(null)).toThrow(/non-empty string/i);
    });
  });

  describe('extractToolContent', () => {
    it('extracts content from content, code, text, etc.', () => {
      expect(extractToolContent({ content: '\\documentclass{article}' })).toBe('\\documentclass{article}');
      expect(extractToolContent({ code: 'let x = 1;' })).toBe('let x = 1;');
      expect(extractToolContent({ text: 'Hello LaTeX' })).toBe('Hello LaTeX');
      expect(extractToolContent({ contents: 'Some contents' })).toBe('Some contents');
      expect(extractToolContent({ data: 'binary or string data' })).toBe('binary or string data');
      expect(extractToolContent({ Content: 'Capitalized Content' })).toBe('Capitalized Content');
      expect(extractToolContent({ Code: 'Capitalized Code' })).toBe('Capitalized Code');
    });

    it('unwraps nested objects for content', () => {
      expect(extractToolContent({ params: { content: 'Nested content' } })).toBe('Nested content');
    });

    it('throws if content is missing', () => {
      expect(() => extractToolContent({})).toThrow(/missing required parameter: content/i);
      expect(() => extractToolContent(null)).toThrow(/missing required parameter: content/i);
    });
  });

  describe('extractToolEditTargets', () => {
    it('extracts target and replacement with alias keys', () => {
      expect(
        extractToolEditTargets({ target: 'foo', replacement: 'bar' })
      ).toEqual({ target: 'foo', replacement: 'bar' });

      expect(
        extractToolEditTargets({ find: 'original text', replace: 'new text' })
      ).toEqual({ target: 'original text', replacement: 'new text' });

      expect(
        extractToolEditTargets({ search: 'old', substitute: 'new' })
      ).toEqual({ target: 'old', replacement: 'new' });

      expect(
        extractToolEditTargets({ old_text: 'first', new_text: 'second' })
      ).toEqual({ target: 'first', replacement: 'second' });
    });

    it('throws when target or replacement are missing or empty', () => {
      expect(() => extractToolEditTargets({ replacement: 'only' })).toThrow(/target/i);
      expect(() => extractToolEditTargets({ target: '', replacement: 'b' })).toThrow(/empty/i);
      expect(() => extractToolEditTargets({ target: 'a' })).toThrow(/replacement/i);
    });
  });

  describe('extractToolQuery', () => {
    it('extracts query from query, q, search, prompt, Query', () => {
      expect(extractToolQuery({ query: 'quantum computing' })).toBe('quantum computing');
      expect(extractToolQuery({ q: 'einstein' })).toBe('einstein');
      expect(extractToolQuery({ search: 'deep learning' })).toBe('deep learning');
      expect(extractToolQuery({ prompt: 'transformers' })).toBe('transformers');
      expect(extractToolQuery({ Query: 'graph neural networks' })).toBe('graph neural networks');
    });

    it('throws when query is empty or missing', () => {
      expect(() => extractToolQuery({})).toThrow(/search query is required/i);
      expect(() => extractToolQuery({ query: '   ' })).toThrow(/search query is required/i);
    });
  });
});
