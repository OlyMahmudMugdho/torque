export function normalizeFilePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new Error('Invalid path: path must be a non-empty string');
  }
  const trimmed = rawPath.trim();
  if (!trimmed) {
    throw new Error('Invalid path: empty path');
  }

  const normalizedSlashes = trimmed.replace(/\\/g, '/');
  const rawSegments = normalizedSlashes.split('/');
  const cleanedSegments: string[] = [];

  for (const seg of rawSegments) {
    if (seg === '' || seg === '.') {
      continue;
    }
    if (seg === '..') {
      throw new Error(`Invalid path: parent traversal not allowed in "${rawPath}"`);
    }
    cleanedSegments.push(seg);
  }

  if (cleanedSegments.length === 0) {
    throw new Error(`Invalid path: resulting path is empty in "${rawPath}"`);
  }

  return cleanedSegments.join('/');
}

/** Name of the zero-byte marker file that makes an empty folder persistent. */
export const FOLDER_MARKER = '.keep';

export function isFolderMarker(path: string): boolean {
  return path === FOLDER_MARKER || path.endsWith('/' + FOLDER_MARKER);
}
