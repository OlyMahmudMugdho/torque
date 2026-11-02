import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore, normalizeFilePath } from '../projectStore';

describe('normalizeFilePath', () => {
  it('normalizes slashes and strips leading ./ or /', () => {
    expect(normalizeFilePath('./chapters//intro.tex')).toBe('chapters/intro.tex');
    expect(normalizeFilePath('\\sections\\math.tex')).toBe('sections/math.tex');
    expect(normalizeFilePath('/main.tex')).toBe('main.tex');
  });

  it('throws on parent traversal segments or empty path', () => {
    expect(() => normalizeFilePath('../secret.tex')).toThrow(/invalid path/i);
    expect(() => normalizeFilePath('chapters/../../etc/passwd')).toThrow(/invalid path/i);
    expect(() => normalizeFilePath('   ')).toThrow(/invalid path/i);
  });
});

describe('ProjectStore', () => {
  let store: ProjectStore;

  beforeEach(async () => {
    store = new ProjectStore(`test-db-${ crypto.randomUUID() }`);
    await store.init();
  });

  it('creates a project with starter main.tex and lists it', async () => {
    const project = await store.createProject('Quantum Paper');
    expect(project.name).toBe('Quantum Paper');
    expect(project.rootEntry).toBe('main.tex');

    const files = await store.listFiles(project.id);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('main.tex');
    expect(String(files[0].content)).toContain('\\documentclass');
  });

  it('updates rootEntry automatically when the current rootEntry file is renamed', async () => {
    const project = await store.createProject('Thesis');
    await store.renameFile(project.id, 'main.tex', 'thesis.tex');

    const [updated] = await store.listProjects();
    expect(updated.rootEntry).toBe('thesis.tex');
  });

  it('prevents deleting the active rootEntry file directly', async () => {
    const project = await store.createProject('Paper');
    await expect(store.deleteFile(project.id, 'main.tex')).rejects.toThrow(/root entry/i);
  });

  it('deletes all project files when a project is deleted', async () => {
    const project = await store.createProject('Temp');
    await store.putFile(project.id, 'refs.bib', '@article{key, title={X}}');
    await store.deleteProject(project.id);

    expect(await store.listProjects()).toHaveLength(0);
    expect(await store.listFiles(project.id)).toHaveLength(0);
  });

  it('renames a project and changes rootEntry explicitly', async () => {
    const project = await store.createProject('Original Name');
    const renamed = await store.renameProject(project.id, 'Updated Name');
    expect(renamed.name).toBe('Updated Name');

    await store.putFile(project.id, 'chapters/main2.tex', '\\documentclass{book}');
    const withNewRoot = await store.setRootEntry(project.id, 'chapters/main2.tex');
    expect(withNewRoot.rootEntry).toBe('chapters/main2.tex');

    // Setting non-existent root entry throws
    await expect(store.setRootEntry(project.id, 'missing.tex')).rejects.toThrow(/not found/i);
  });

  it('supports binary files and getFile', async () => {
    const project = await store.createProject('Binary Test');
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await store.putFile(project.id, 'images/logo.png', bytes, true);

    const fetched = await store.getFile(project.id, 'images/logo.png');
    expect(fetched).toBeDefined();
    expect(fetched?.isBinary).toBe(true);
    expect(Array.from(fetched?.content as Uint8Array)).toEqual([1, 2, 3, 4]);
  });

  it('creates a project with initialFiles and custom rootEntry', async () => {
    const project = await store.createProject(
      'Custom Files',
      [
        { path: 'doc.tex', content: '\\documentclass{report}', isBinary: false },
        { path: 'data.txt', content: 'hello', isBinary: false },
      ],
      'doc.tex'
    );
    expect(project.rootEntry).toBe('doc.tex');
    const files = await store.listFiles(project.id);
    expect(files).toHaveLength(2);
  });
});
