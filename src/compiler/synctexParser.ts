// SyncTeX parser for reverse PDF->source navigation
//
// SyncTeX record format (simplified):
//   Input:<tag>:<filename>
//   [<tag>,<line>:<x>,<y>:<w>,<h>]:<fileTag>:<blockLine>:<blockX>,<blockY>,<blockW>
//
// Coordinates are stored as fixed-point (16.16) in real SyncTeX output; this
// parser accepts plain integer coordinates for testability and divides by
// 65536 when the values look like fixed-point.

import type { SyncTexBlock, SyncTexIndex } from '../types/workspace';

export type { SyncTexIndex } from '../types/workspace';
export { resolveSyncTexPosition, resolveSyncTexSource } from './synctexResolver';

const FIXED_POINT = 65536;

export const parseSyncTex = (rawText: string, fallbackFile = 'unknown'): SyncTexIndex => {
  const files = new Map<number, string>();
  const blocks: SyncTexBlock[] = [];
  let currentPage = 1;

  const inputLines = rawText.split('\n').filter(line => line.startsWith('Input:'));
  for (const line of inputLines) {
    const match = line.match(/Input:(\d+):(.+)/);
    if (match) {
      files.set(parseInt(match[1], 10), match[2]);
    }
  }

  const defaultFile = [...files.values()].find(Boolean) || fallbackFile;
  for (const line of rawText.split('\n')) {
    const pageStart = line.match(/^\{(\d+)/);
    if (pageStart) {
      currentPage = parseInt(pageStart[1], 10);
      continue;
    }

    // Tectonic's page box records look like:
    // [page,line:x,y:width,height,depth
    const pageBox = line.match(/^\[(\d+),(\d+):(\d+),(\d+):(\d+),(\d+),(\d+)/);
    if (pageBox) {
      currentPage = parseInt(pageBox[1], 10);
      blocks.push({
        file: defaultFile,
        line: parseInt(pageBox[2], 10),
        x: parseInt(pageBox[3], 10) / FIXED_POINT,
        y: parseInt(pageBox[4], 10) / FIXED_POINT,
        width: parseInt(pageBox[5], 10) / FIXED_POINT,
        height: parseInt(pageBox[6], 10) / FIXED_POINT,
        page: currentPage,
      });
      continue;
    }

    // Line-pinning nodes carry precise source anchors. Tectonic emits these
    // with and without a space after the node type (h1,... and h 1,...).
    const node = line.match(/^[hvkgx]\s*(\d+),(\d+):(-?\d+),(-?\d+)/);
    if (node) {
      blocks.push({
        file: files.get(parseInt(node[1], 10)) || defaultFile,
        line: parseInt(node[2], 10),
        x: parseInt(node[3], 10) / FIXED_POINT,
        y: parseInt(node[4], 10) / FIXED_POINT,
        width: 0,
        height: 0,
        page: currentPage,
      });
      continue;
    }

    // Keep accepting the compact fixture format used by the parser tests.
    if (!line.startsWith('[') || !line.includes(']:')) continue;
    const match = line.match(
      /\[(\d+),(\d+):(\d+),(\d+):(\d+),(\d+)\]:(\d+):(\d+):(\d+),(\d+),(\d+)/
    );
    if (match) {
      const tag = parseInt(match[1], 10);
      const blockLine = parseInt(match[2], 10);
      const x = parseInt(match[3], 10);
      const y = parseInt(match[4], 10);
      const width = parseInt(match[5], 10);
      const height = parseInt(match[6], 10);
      const fileTag = parseInt(match[7], 10);

      blocks.push({
        file: files.get(fileTag) || defaultFile,
        line: blockLine,
        x: x / FIXED_POINT,
        y: y / FIXED_POINT,
        width: width / FIXED_POINT,
        height: height / FIXED_POINT,
        page: tag,
      });
    }
  }

  // Tectonic may label the synthetic primary input as `texput`; the editor
  // knows the real entry path, so use that path for navigation.
  for (const block of blocks) {
    if (block.file === 'texput' || block.file === 'unknown') {
      block.file = fallbackFile;
    }
  }

  return { files, blocks };
};

export const decompressGzip = async (bytes: Uint8Array): Promise<string> => {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).text();
    } catch {
      // jsdom exposes a non-functional DecompressionStream stub; fall through.
    }
  }
  // The browser worker always takes the DecompressionStream path. Keep a
  // runtime-only Node fallback for tests without making webpack bundle node:zlib.
  const zlib = await import(/* webpackIgnore: true */ 'node:zlib');
  const decompressed = zlib.gunzipSync(Buffer.from(bytes.slice()));
  return decompressed.toString('utf-8');
};
