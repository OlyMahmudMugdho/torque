import JSZip from 'jszip';
import type { ProjectFile } from '../types/workspace';
import { normalizeFilePath } from '../storage/projectStore';

export interface ImportedZipProject {
  rootEntry: string;
  files: Omit<ProjectFile, 'projectId' | 'updatedAt'>[];
}

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'pdf',
  'eps',
  'svg',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  'zip',
  'gz',
  'tar',
]);

export function isBinaryFilePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return BINARY_EXTENSIONS.has(ext);
}

export async function exportProjectZip(files: ProjectFile[]): Promise<Uint8Array> {
  const zip = new JSZip();

  for (const file of files) {
    if (file.isBinary) {
      const data =
        file.content instanceof Uint8Array
          ? file.content
          : new TextEncoder().encode(String(file.content));
      zip.file(file.path, data);
    } else {
      zip.file(file.path, String(file.content));
    }
  }

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export async function importProjectZip(zipData: ArrayBuffer | Uint8Array): Promise<ImportedZipProject> {
  const zip = await JSZip.loadAsync(zipData);
  const files: Omit<ProjectFile, 'projectId' | 'updatedAt'>[] = [];

  // Collect non-directory, non-OS files
  const rawEntries: Array<{ name: string; file: JSZip.JSZipObject }> = [];
  zip.forEach((relativePath, file) => {
    if (file.dir) return;
    if (relativePath.startsWith('__MACOSX/') || relativePath.includes('/__MACOSX/')) return;
    if (relativePath.endsWith('.DS_Store')) return;
    rawEntries.push({ name: relativePath, file });
  });

  if (rawEntries.length === 0) {
    throw new Error('The archive contains no files.');
  }

  // Detect and strip single root wrapper directory if all files share one
  const firstSlashIndices = rawEntries.map((e) => e.name.indexOf('/'));
  let stripPrefix = '';
  if (firstSlashIndices.every((idx) => idx > 0)) {
    const candidatePrefix = rawEntries[0].name.slice(0, firstSlashIndices[0] + 1);
    if (rawEntries.every((e) => e.name.startsWith(candidatePrefix))) {
      stripPrefix = candidatePrefix;
    }
  }

  for (const { name, file } of rawEntries) {
    const unadjustedPath = stripPrefix ? name.slice(stripPrefix.length) : name;
    if (!unadjustedPath.trim()) continue;

    const normalizedPath = normalizeFilePath(unadjustedPath);
    const binary = isBinaryFilePath(normalizedPath);

    if (binary) {
      const buf = await file.async('uint8array');
      files.push({
        path: normalizedPath,
        content: buf,
        isBinary: true,
      });
    } else {
      const text = await file.async('string');
      files.push({
        path: normalizedPath,
        content: text,
        isBinary: false,
      });
    }
  }

  // Determine rootEntry
  const texFiles = files.filter((f) => f.path.endsWith('.tex'));
  if (texFiles.length === 0) {
    throw new Error('The archive contains no .tex files.');
  }

  let rootEntry = 'main.tex';
  const hasMain = texFiles.some((f) => f.path === 'main.tex');

  if (hasMain) {
    rootEntry = 'main.tex';
  } else {
    // Look for file containing \documentclass
    const docClassFile = texFiles.find((f) => typeof f.content === 'string' && f.content.includes('\\documentclass'));
    rootEntry = docClassFile ? docClassFile.path : texFiles[0].path;
  }

  return {
    rootEntry,
    files,
  };
}
