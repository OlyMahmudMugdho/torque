import { describe, it, expect, vi } from 'vitest';
import { TauriCompilerDriver } from '../compilerDriver';
import { computeMissingRequirements, missingRequirementsMessage } from '../serverCompiler';

describe('missingRequirements', () => {
  it('maps snake_case and camelCase payloads', async () => {
    for (const key of ['missing_requirements', 'missingRequirements']) {
      const invoke = vi.fn().mockResolvedValue({ status: 'failed', diagnostics: [], [key]: ['latexmk'] });
      const driver = new TauriCompilerDriver(invoke);
      const res = await driver.compile({ projectId: 'p', files: [], entry: 'main.tex' } as never);
      expect(res.missingRequirements).toEqual(['latexmk']);
    }
  });

  it('omits missingRequirements when empty', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 'spotless', diagnostics: [], missing_requirements: [] });
    const res = await new TauriCompilerDriver(invoke).compile({ projectId: 'p', files: [], entry: 'main.tex' } as never);
    expect(res.missingRequirements).toBeUndefined();
  });

  it('computes missing requirements', () => {
    const all = { latexmk: true, pdflatex: true, xelatex: false, lualatex: false };
    expect(computeMissingRequirements(all, 'pdflatex')).toEqual([]);
    expect(computeMissingRequirements(all, 'xelatex')).toEqual(['xelatex']);
    expect(computeMissingRequirements({ ...all, latexmk: false }, 'pdflatex')).toEqual(['latexmk']);
    const none = { latexmk: false, pdflatex: false, xelatex: false, lualatex: false };
    expect(computeMissingRequirements(none, 'pdflatex')).toHaveLength(2);
    expect(missingRequirementsMessage(['latexmk'])).toContain('Missing: latexmk');
  });
});
