import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTauri,
  uint8ArrayToBase64,
  base64ToUint8Array,
  decodeTauriFile,
  encodeFileForTauri,
  TauriStorage,
  type RawTauriFile,
} from '../tauriStorage';
import { ProjectStore } from '../projectStore';
import type { Project, ProjectFile } from '../../types/workspace';

describe('tauriStorage', () => {
  describe('isTauri() detection', () => {
    const originalInternals = (window as any).__TAURI_INTERNALS__;

    afterEach(() => {
      (window as any).__TAURI_INTERNALS__ = originalInternals;
    });

    it('returns false when window.__TAURI_INTERNALS__ is undefined', () => {
      delete (window as any).__TAURI_INTERNALS__;
      expect(isTauri()).toBe(false);
    });

    it('returns true when window.__TAURI_INTERNALS__ is present', () => {
      (window as any).__TAURI_INTERNALS__ = {};
      expect(isTauri()).toBe(true);
    });
  });

  describe('base64 and binary conversions', () => {
    it('encodes and decodes Uint8Array correctly', () => {
      const bytes = new Uint8Array([0, 72, 101, 108, 108, 111, 255]);
      const base64 = uint8ArrayToBase64(bytes);
      expect(typeof base64).toBe('string');
      const decoded = base64ToUint8Array(base64);
      expect(Array.from(decoded)).toEqual(Array.from(bytes));
    });

    it('decodeTauriFile converts base64 string to Uint8Array when isBinary is true', () => {
      const originalBytes = new Uint8Array([1, 2, 3, 4, 5]);
      const b64 = uint8ArrayToBase64(originalBytes);
      const raw: RawTauriFile = {
        projectId: 'p1',
        path: 'images/test.png',
        content: b64,
        isBinary: true,
        updatedAt: 12345,
      };

      const decoded = decodeTauriFile(raw);
      expect(decoded.isBinary).toBe(true);
      expect(decoded.content instanceof Uint8Array).toBe(true);
      expect(Array.from(decoded.content as Uint8Array)).toEqual([1, 2, 3, 4, 5]);
    });

    it('decodeTauriFile converts number array to Uint8Array when isBinary is true', () => {
      const raw: RawTauriFile = {
        projectId: 'p1',
        path: 'data.bin',
        content: [10, 20, 30],
        isBinary: true,
        updatedAt: 12345,
      };

      const decoded = decodeTauriFile(raw);
      expect(decoded.isBinary).toBe(true);
      expect(decoded.content instanceof Uint8Array).toBe(true);
      expect(Array.from(decoded.content as Uint8Array)).toEqual([10, 20, 30]);
    });

    it('decodeTauriFile converts numeric object to Uint8Array when isBinary is true', () => {
      const raw: RawTauriFile = {
        projectId: 'p1',
        path: 'data.bin',
        content: { '0': 7, '1': 8, '2': 9 },
        isBinary: true,
        updatedAt: 12345,
      };

      const decoded = decodeTauriFile(raw);
      expect(decoded.isBinary).toBe(true);
      expect(decoded.content instanceof Uint8Array).toBe(true);
      expect(Array.from(decoded.content as Uint8Array)).toEqual([7, 8, 9]);
    });

    it('decodeTauriFile preserves text content when isBinary is false', () => {
      const raw: RawTauriFile = {
        projectId: 'p1',
        path: 'main.tex',
        content: '\\documentclass{article}',
        isBinary: false,
        updatedAt: 12345,
      };

      const decoded = decodeTauriFile(raw);
      expect(decoded.isBinary).toBe(false);
      expect(decoded.content).toBe('\\documentclass{article}');
    });

    it('encodeFileForTauri converts Uint8Array to base64 string', () => {
      const file: ProjectFile = {
        projectId: 'p1',
        path: 'logo.png',
        content: new Uint8Array([65, 66, 67]),
        isBinary: true,
        updatedAt: 12345,
      };

      const encoded = encodeFileForTauri(file);
      expect(encoded.isBinary).toBe(true);
      expect(typeof encoded.content).toBe('string');
      expect(encoded.content).toBe(uint8ArrayToBase64(new Uint8Array([65, 66, 67])));
    });
  });

  describe('TauriStorage operations', () => {
    let mockInvoke: ReturnType<typeof vi.fn>;
    let storage: TauriStorage;

    beforeEach(() => {
      mockInvoke = vi.fn();
      storage = new TauriStorage(mockInvoke as any);
    });

    it('init() and getTorqueDir() invoke get_torque_dir', async () => {
      mockInvoke.mockResolvedValueOnce('/home/user/.torque');
      const dir = await storage.getTorqueDir();
      expect(dir).toBe('/home/user/.torque');
      expect(mockInvoke).toHaveBeenCalledWith('get_torque_dir');

      mockInvoke.mockResolvedValueOnce('/home/user/.torque');
      await storage.init();
      expect(mockInvoke).toHaveBeenCalledWith('get_torque_dir');
    });

    it('listProjects() invokes tauri_list_projects and sorts by updatedAt desc', async () => {
      const projects: Project[] = [
        { id: '1', name: 'Older', rootEntry: 'main.tex', createdAt: 100, updatedAt: 200 },
        { id: '2', name: 'Newer', rootEntry: 'main.tex', createdAt: 100, updatedAt: 500 },
      ];
      mockInvoke.mockResolvedValueOnce(projects);

      const list = await storage.listProjects();
      expect(mockInvoke).toHaveBeenCalledWith('tauri_list_projects');
      expect(list[0].id).toBe('2');
      expect(list[1].id).toBe('1');
    });

    it('createProject() creates a project with main.tex and calls tauri_save_project', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const project = await storage.createProject('My Document');
      expect(project.name).toBe('My Document');
      expect(project.rootEntry).toBe('main.tex');
      expect(mockInvoke).toHaveBeenCalledWith('tauri_save_project', expect.objectContaining({
        project: expect.objectContaining({ name: 'My Document', rootEntry: 'main.tex' }),
        files: expect.arrayContaining([
          expect.objectContaining({ path: 'main.tex', isBinary: false }),
        ]),
      }));
    });

    it('createProject() respects initialFiles and rootEntry', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const project = await storage.createProject(
        'Custom Proj',
        [
          { path: 'doc.tex', content: 'hello', isBinary: false },
          { path: 'img.png', content: new Uint8Array([1, 2, 3]), isBinary: true },
        ],
        'doc.tex'
      );

      expect(project.rootEntry).toBe('doc.tex');
      expect(mockInvoke).toHaveBeenCalledWith('tauri_save_project', expect.objectContaining({
        project: expect.objectContaining({ rootEntry: 'doc.tex' }),
        files: expect.arrayContaining([
          expect.objectContaining({ path: 'doc.tex', isBinary: false }),
          expect.objectContaining({ path: 'img.png', isBinary: true }),
        ]),
      }));
    });

    it('renameProject() loads project, modifies name, and saves', async () => {
      const existingProj: Project = {
        id: 'proj-1',
        name: 'Old Name',
        rootEntry: 'main.tex',
        createdAt: 100,
        updatedAt: 100,
      };
      const existingFiles: RawTauriFile[] = [
        { projectId: 'proj-1', path: 'main.tex', content: 'tex', isBinary: false, updatedAt: 100 },
      ];

      mockInvoke.mockResolvedValueOnce([existingProj, existingFiles]);
      mockInvoke.mockResolvedValueOnce(undefined);

      const updated = await storage.renameProject('proj-1', 'New Name');
      expect(updated.name).toBe('New Name');
      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'tauri_load_project', { id: 'proj-1' });
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'tauri_save_project', expect.objectContaining({
        project: expect.objectContaining({ id: 'proj-1', name: 'New Name' }),
      }));
    });

    it('setRootEntry() updates the root entry if the file exists', async () => {
      const existingProj: Project = {
        id: 'proj-1',
        name: 'My Proj',
        rootEntry: 'main.tex',
        createdAt: 100,
        updatedAt: 100,
      };
      const existingFiles: RawTauriFile[] = [
        { projectId: 'proj-1', path: 'main.tex', content: 'tex', isBinary: false, updatedAt: 100 },
        { projectId: 'proj-1', path: 'chapter1.tex', content: 'ch1', isBinary: false, updatedAt: 100 },
      ];

      mockInvoke.mockResolvedValueOnce([existingProj, existingFiles]);
      mockInvoke.mockResolvedValueOnce(undefined);

      const updated = await storage.setRootEntry('proj-1', 'chapter1.tex');
      expect(updated.rootEntry).toBe('chapter1.tex');
      expect(mockInvoke).toHaveBeenCalledWith('tauri_save_project', expect.objectContaining({
        project: expect.objectContaining({ rootEntry: 'chapter1.tex' }),
      }));
    });

    it('setRootEntry() throws error if root file does not exist', async () => {
      const existingProj: Project = {
        id: 'proj-1',
        name: 'My Proj',
        rootEntry: 'main.tex',
        createdAt: 100,
        updatedAt: 100,
      };
      const existingFiles: RawTauriFile[] = [
        { projectId: 'proj-1', path: 'main.tex', content: 'tex', isBinary: false, updatedAt: 100 },
      ];

      mockInvoke.mockResolvedValueOnce([existingProj, existingFiles]);

      await expect(storage.setRootEntry('proj-1', 'nonexistent.tex')).rejects.toThrow(
        /Root entry file "nonexistent.tex" not found/
      );
    });

    it('deleteProject() invokes tauri_delete_project', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      await storage.deleteProject('proj-1');
      expect(mockInvoke).toHaveBeenCalledWith('tauri_delete_project', { id: 'proj-1' });
    });

    it('listFiles() loads files and decodes them correctly', async () => {
      const existingProj: Project = {
        id: 'proj-1',
        name: 'My Proj',
        rootEntry: 'main.tex',
        createdAt: 100,
        updatedAt: 100,
      };
      const binBytes = new Uint8Array([5, 6, 7]);
      const existingFiles: RawTauriFile[] = [
        { projectId: 'proj-1', path: 'main.tex', content: 'tex', isBinary: false, updatedAt: 100 },
        { projectId: 'proj-1', path: 'fig.png', content: uint8ArrayToBase64(binBytes), isBinary: true, updatedAt: 100 },
      ];

      mockInvoke.mockResolvedValueOnce([existingProj, existingFiles]);

      const files = await storage.listFiles('proj-1');
      expect(files.length).toBe(2);
      expect(files[0].path).toBe('fig.png');
      expect(files[0].content instanceof Uint8Array).toBe(true);
      expect(files[1].path).toBe('main.tex');
      expect(files[1].content).toBe('tex');
    });

    it('putFile() adds or updates file and saves project', async () => {
      const existingProj: Project = {
        id: 'proj-1',
        name: 'My Proj',
        rootEntry: 'main.tex',
        createdAt: 100,
        updatedAt: 100,
      };
      const existingFiles: RawTauriFile[] = [
        { projectId: 'proj-1', path: 'main.tex', content: 'tex', isBinary: false, updatedAt: 100 },
      ];

      mockInvoke.mockResolvedValueOnce([existingProj, existingFiles]);
      mockInvoke.mockResolvedValueOnce(undefined);

      const added = await storage.putFile('proj-1', 'section.tex', '\\section{Hello}');
      expect(added.path).toBe('section.tex');
      expect(mockInvoke).toHaveBeenCalledWith('tauri_save_project', expect.objectContaining({
        files: expect.arrayContaining([
          expect.objectContaining({ path: 'main.tex' }),
          expect.objectContaining({ path: 'section.tex', content: '\\section{Hello}' }),
        ]),
      }));
    });

    it('renameFile() renames file and updates rootEntry if it matches', async () => {
      const existingProj: Project = {
        id: 'proj-1',
        name: 'My Proj',
        rootEntry: 'main.tex',
        createdAt: 100,
        updatedAt: 100,
      };
      const existingFiles: RawTauriFile[] = [
        { projectId: 'proj-1', path: 'main.tex', content: 'tex', isBinary: false, updatedAt: 100 },
      ];

      mockInvoke.mockResolvedValueOnce([existingProj, existingFiles]);
      mockInvoke.mockResolvedValueOnce(undefined);

      const renamed = await storage.renameFile('proj-1', 'main.tex', 'document.tex');
      expect(renamed.path).toBe('document.tex');
      expect(mockInvoke).toHaveBeenCalledWith('tauri_save_project', expect.objectContaining({
        project: expect.objectContaining({ rootEntry: 'document.tex' }),
        files: expect.arrayContaining([
          expect.objectContaining({ path: 'document.tex' }),
        ]),
      }));
    });

    it('deleteFile() prevents deleting root entry file', async () => {
      const existingProj: Project = {
        id: 'proj-1',
        name: 'My Proj',
        rootEntry: 'main.tex',
        createdAt: 100,
        updatedAt: 100,
      };
      const existingFiles: RawTauriFile[] = [
        { projectId: 'proj-1', path: 'main.tex', content: 'tex', isBinary: false, updatedAt: 100 },
      ];

      mockInvoke.mockResolvedValueOnce([existingProj, existingFiles]);

      await expect(storage.deleteFile('proj-1', 'main.tex')).rejects.toThrow(
        /Cannot delete the active root entry file/
      );
    });

    it('deleteFile() deletes a non-root file', async () => {
      const existingProj: Project = {
        id: 'proj-1',
        name: 'My Proj',
        rootEntry: 'main.tex',
        createdAt: 100,
        updatedAt: 100,
      };
      const existingFiles: RawTauriFile[] = [
        { projectId: 'proj-1', path: 'main.tex', content: 'tex', isBinary: false, updatedAt: 100 },
        { projectId: 'proj-1', path: 'extra.tex', content: 'extra', isBinary: false, updatedAt: 100 },
      ];

      mockInvoke.mockResolvedValueOnce([existingProj, existingFiles]);
      mockInvoke.mockResolvedValueOnce(undefined);

      await storage.deleteFile('proj-1', 'extra.tex');
      expect(mockInvoke).toHaveBeenCalledWith('tauri_save_project', expect.objectContaining({
        files: [expect.objectContaining({ path: 'main.tex' })],
      }));
    });
  });

  describe('ProjectStore integration with Tauri / IndexedDB', () => {
    it('uses IndexedDB transparently when isTauri() is false', async () => {
      delete (window as any).__TAURI_INTERNALS__;
      const store = new ProjectStore(`test-browser-${crypto.randomUUID()}`);
      const project = await store.createProject('Browser Project');
      expect(project.name).toBe('Browser Project');

      const list = await store.listProjects();
      expect(list.some((p) => p.id === project.id)).toBe(true);
      store.close();
    });

    it('delegates to TauriStorage when useTauri option is true', async () => {
      const mockInvoke = vi.fn();
      const tauriStorage = new TauriStorage(mockInvoke as any);
      mockInvoke.mockResolvedValueOnce([]);

      const store = new ProjectStore('ignored-db', {
        useTauri: true,
        tauriStorage,
      });

      const list = await store.listProjects();
      expect(list).toEqual([]);
      expect(mockInvoke).toHaveBeenCalledWith('tauri_list_projects');
    });
  });
});
