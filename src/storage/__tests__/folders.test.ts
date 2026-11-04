import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { ProjectStore } from '../projectStore';
import { TauriStorage, encodeFileForTauri } from '../tauriStorage';
import type { ProjectFile } from '../../types/workspace';

const f = (path: string, content = 'x'): ProjectFile => ({
  projectId: 'p1', path, content, isBinary: false, updatedAt: 1,
});

describe('folder support: ProjectStore (IndexedDB)', () => {
  it('creates, renames and deletes folders recursively', async () => {
    const store = new ProjectStore(`folders-${crypto.randomUUID()}`, { useTauri: false });
    await store.init();
    const p = await store.createProject('P');
    await store.createFolder(p.id, 'figs/sub');
    await store.putFile(p.id, 'figs/a.tex', 'a');
    await store.putFile(p.id, 'figs/sub/b.tex', 'b');

    let paths = (await store.listFiles(p.id)).map((x) => x.path);
    expect(paths).toContain('figs/sub/.keep');

    await store.renameFilePath(p.id, 'figs', 'images');
    paths = (await store.listFiles(p.id)).map((x) => x.path);
    expect(paths).toEqual(expect.arrayContaining(['images/a.tex', 'images/sub/b.tex', 'images/sub/.keep']));
    expect(paths.some((x) => x.startsWith('figs/'))).toBe(false);

    await store.deleteFilePath(p.id, 'images');
    paths = (await store.listFiles(p.id)).map((x) => x.path);
    expect(paths).toEqual(['main.tex']);
  });

  it('persists an empty folder and rejects traversal', async () => {
    const store = new ProjectStore(`folders-${crypto.randomUUID()}`, { useTauri: false });
    await store.init();
    const p = await store.createProject('P');
    await store.createFolder(p.id, 'empty');
    expect((await store.listFiles(p.id)).map((x) => x.path)).toContain('empty/.keep');
    await expect(store.createFolder(p.id, '../evil')).rejects.toThrow(/invalid path/i);
    await expect(store.createFolder(p.id, 'main.tex')).rejects.toThrow(/already exists/i);
  });

  it('refuses to delete a folder containing the root entry', async () => {
    const store = new ProjectStore(`folders-${crypto.randomUUID()}`, { useTauri: false });
    await store.init();
    const p = await store.createProject('P', [{ path: 'src/main.tex', content: 'x', isBinary: false }], 'src/main.tex');
    await expect(store.deleteFilePath(p.id, 'src')).rejects.toThrow(/root entry/i);
  });
});

describe('folder support: TauriStorage', () => {
  const setup = (files: ProjectFile[], rootEntry = 'main.tex') => {
    const project = { id: 'p1', name: 'P', rootEntry, createdAt: 1, updatedAt: 1 };
    let saved: { project: any; files: any[] } | null = null;
    const invoke = vi.fn(async (cmd: string, args?: any) => {
      if (cmd === 'tauri_load_project') return [{ ...project }, files.map(encodeFileForTauri)];
      if (cmd === 'tauri_save_project') { saved = args; return undefined; }
      return undefined;
    });
    return { storage: new TauriStorage(invoke as any), getSaved: () => saved!, invoke };
  };

  it('createFolder writes a zero-byte .keep marker', async () => {
    const { storage, getSaved } = setup([f('main.tex')]);
    await storage.createFolder('p1', 'a/b');
    expect(getSaved().files.map((x) => x.path)).toContain('a/b/.keep');
    await expect(storage.createFolder('p1', '../x')).rejects.toThrow(/invalid path/i);
  });

  it('renameFilePath renames every file under a folder prefix and the root entry', async () => {
    const { storage, getSaved } = setup(
      [f('src/main.tex'), f('src/sub/x.tex'), f('src/sub/.keep', ''), f('other.tex')],
      'src/main.tex'
    );
    await storage.renameFilePath('p1', 'src', 'code');
    const saved = getSaved();
    expect(saved.files.map((x) => x.path).sort()).toEqual(
      ['code/main.tex', 'code/sub/.keep', 'code/sub/x.tex', 'other.tex']
    );
    expect(saved.project.rootEntry).toBe('code/main.tex');
  });

  it('deleteFilePath removes a folder recursively but guards the root entry', async () => {
    const { storage, getSaved } = setup([f('main.tex'), f('d/a.tex'), f('d/s/.keep', '')]);
    await storage.deleteFilePath('p1', 'd');
    expect(getSaved().files.map((x) => x.path)).toEqual(['main.tex']);
    const g = setup([f('d/main.tex')], 'd/main.tex');
    await expect(g.storage.deleteFilePath('p1', 'd')).rejects.toThrow(/root entry/i);
  });
});
