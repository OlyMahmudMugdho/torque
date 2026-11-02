import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { exportProjectZip, importProjectZip } from '../zipArchive';
import type { ProjectFile } from '../../types/workspace';

describe('zipArchive', () => {
  it('round-trips text and binary files through exportProjectZip and importProjectZip', async () => {
    const files: ProjectFile[] = [
      {
        projectId: 'p1',
        path: 'main.tex',
        content: '\\documentclass{article}\\begin{document}Hi\\end{document}',
        isBinary: false,
        updatedAt: 1,
      },
      {
        projectId: 'p1',
        path: 'images/fig1.png',
        content: new Uint8Array([137, 80, 78, 71]),
        isBinary: true,
        updatedAt: 1,
      },
    ];

    const zipBytes = await exportProjectZip(files);
    const imported = await importProjectZip(zipBytes);

    expect(imported.rootEntry).toBe('main.tex');
    expect(imported.files).toHaveLength(2);
    const fig = imported.files.find((f) => f.path === 'images/fig1.png');
    expect(fig?.isBinary).toBe(true);
    expect(Array.from(fig?.content as Uint8Array)).toEqual([137, 80, 78, 71]);
  });

  it('strips __MACOSX and .DS_Store and auto-detects \\documentclass root entry when main.tex is absent', async () => {
    const zip = new JSZip();
    zip.file('__MACOSX/._paper.tex', 'junk');
    zip.file('.DS_Store', 'junk');
    zip.file('chapters/intro.tex', '\\section{Intro}');
    zip.file('paper.tex', '\\documentclass{article}\n\\begin{document}\\input{chapters/intro}\\end{document}');
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const imported = await importProjectZip(bytes);
    expect(imported.files.map((f) => f.path).sort()).toEqual(['chapters/intro.tex', 'paper.tex']);
    expect(imported.rootEntry).toBe('paper.tex');
  });

  it('throws if the archive contains no .tex files', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'hello');
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    await expect(importProjectZip(bytes)).rejects.toThrow(/no \.tex file/i);
  });
});
