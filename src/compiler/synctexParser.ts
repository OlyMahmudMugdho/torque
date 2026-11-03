// Simple SyncTeX parser for compilation testing
// This provides the basic functionality needed for the reverse PDF->code navigation

export interface SyncTexBlock {
  file: string;
  line: number;
  x: number;    // PDF points (pt)
  y: number;    // PDF points (pt)
  width: number;
  height: number;
  page: number;
}

export interface SyncTexIndex {
  files: Map<number, string>;
  blocks: SyncTexBlock[];
}

/**
 * Parse SyncTeX data into a structured index.
 *
 * Input format:
 * - `Input:<tag>:<filename>` lines define input files
 * - Record lines: `[<tag>:<line>:<x>,<y>:<w>,<h>:<fileTag>:<blockLine>:<blockX>,<blockY>,<blockW>,<blockH>]`
 *
 * Output format:
 * - SyncTexIndex with files map and blocks array
 * - Blocks contain: file, line, x (PDF pt), y (PDF pt), width, height, page
 */
export const parseSyncTex = (rawText: string): SyncTexIndex => {
  const files = new Map<number, string>();
  const blocks: SyncTexBlock[] = [];

  const inputLines = rawText.split('\n').filter(line => line.startsWith('Input:'));
  for (const line of inputLines) {
    const match = line.match(/Input:(\d+):(.+)/);
    if (match) {
      const tag = parseInt(match[1], 10);
      const filename = match[2];
      files.set(tag, filename);
    }
  }

  const recordLines = rawText.split('\n').filter(line => line.startsWith('[') && line.includes(']:'));
  for (const line of recordLines) {
    const match = line.match(/\[(\d+):(\d+):(\d+),(\d+),(\d+),(\d+)\]:(\d+):(\d+):(\d+),(\d+),(\d+),(\d+),(\d+)/);
    if (match) {
      const tag = parseInt(match[1], 10);
      const blockLine = parseInt(match[8], 10);
      const fileTag = parseInt(match[7], 10);

      blocks.push({
        file: files.get(fileTag) || 'unknown',
        line: blockLine,
        x: parseInt(match[9], 10) / 65536,
        y: parseInt(match[10], 10) / 65536,
        width: parseInt(match[11], 10) / 65536,
        height: parseInt(match[12], 10) / 65536,
        page: tag,
      });
    }
  }

  return { files, blocks };
};

export const resolveSyncTexPosition = (
  index: { files: Map<number, string>; blocks: SyncTexBlock[] },
  page: number,
  xPt: number,
  yPt: number,
  tolerancePt?: number
): { file: string; line: number } | null => {
  const tolerance = tolerancePt ?? 10;
  let bestMatch: { file: string; line: number; distance: number } | null = null;

  for (const block of index.blocks) {
    if (block.page !== page) continue;

    const dx = Math.abs(xPt - block.x);
    const dy = Math.abs(yPt - block.y);
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= tolerance && (!bestMatch || distance < bestMatch.distance)) {
      bestMatch = { file: block.file, line: block.line, distance };
    }
  }

  return bestMatch ? { file: bestMatch.file, line: bestMatch.line } : null;
};

export const decompressGzip = async (bytes: Uint8Array): Promise<string> => '';