import { describe, it, expect } from 'vitest';
import {
  WORKSPACE_TOOLS_SCHEMA,
  validateToolPath,
} from '../tools';

describe('tools', () => {
  describe('WORKSPACE_TOOLS_SCHEMA', () => {
    it('defines an array of 5 OpenAI-compatible tool specifications', () => {
      expect(Array.isArray(WORKSPACE_TOOLS_SCHEMA)).toBe(true);
      expect(WORKSPACE_TOOLS_SCHEMA).toHaveLength(5);
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
});
