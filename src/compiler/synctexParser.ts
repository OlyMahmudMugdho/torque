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

/**
 * Normalize a file name recorded by SyncTeX (often absolute and containing
 * `/./`, e.g. `/tmp/build/./main.tex`) to a project-relative path. When
 * `projectPaths` is given, the longest project path that is a suffix of the
 * recorded name wins. Returns the cleaned name otherwise.
 */
export const normalizeSyncTexPath = (name: string, projectPaths: string[] = []): string => {
  const cleaned = name
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((seg, i) => !(seg === '.' || (seg === '' && i > 0)))
    .join('/');
  let best = '';
  for (const p of projectPaths) {
    const pp = p.replace(/^\.\//, '');
    if ((cleaned === pp || cleaned.endsWith('/' + pp)) && pp.length > best.length) best = pp;
  }
  if (best) return best;
  return cleaned.startsWith('/') ? cleaned : cleaned.replace(/^\.\//, '');
};

const parseRealSyncTex = (
  rawText: string,
  fallbackFile: string,
  projectPaths: string[]
): SyncTexIndex => {
  const files = new Map<number, string>();
  const blocks: SyncTexBlock[] = [];
  let magnification = 1000;
  let unit = 1;
  let xOffset = 0;
  let yOffset = 0;
  let inContent = false;
  let page = 1;
  // sp per PDF point (bp)
  const SP_PER_BP = 65781.76;
  const toPt = (v: number, offset: number) => ((v * unit * magnification) / 1000 + offset) / SP_PER_BP;

  for (const rawLine of rawText.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!inContent) {
      let m = line.match(/^Input:(\d+):(.+)$/);
      if (m) {
        const name = normalizeSyncTexPath(m[2], projectPaths);
        files.set(parseInt(m[1], 10), name === 'texput' ? fallbackFile : name);
        continue;
      }
      m = line.match(/^Magnification:(\d+)/);
      if (m) magnification = parseInt(m[1], 10);
      m = line.match(/^Unit:(\d+)/);
      if (m) unit = parseInt(m[1], 10);
      m = line.match(/^X Offset:(-?\d+)/);
      if (m) xOffset = parseInt(m[1], 10);
      m = line.match(/^Y Offset:(-?\d+)/);
      if (m) yOffset = parseInt(m[1], 10);
      if (line.startsWith('Content:')) inContent = true;
      continue;
    }
    const pg = line.match(/^\{(\d+)/);
    if (pg) {
      page = parseInt(pg[1], 10);
      continue;
    }
    // Boxes: [ vbox, ( hbox, h void hbox; leaves: x g k $ v
    const m = line.match(/^([\[(hvkgx$])(\d+),(\d+):(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/);
    if (!m) continue;
    const kind = m[1];
    const file = files.get(parseInt(m[2], 10)) ?? fallbackFile;
    const isBox = kind === '[' || kind === '(';
    blocks.push({
      file,
      line: parseInt(m[3], 10),
      x: toPt(parseInt(m[4], 10), xOffset),
      y: toPt(parseInt(m[5], 10), yOffset),
      width: isBox && m[6] ? (parseInt(m[6], 10) * unit * magnification) / 1000 / SP_PER_BP : 0,
      height: isBox && m[7] ? (parseInt(m[7], 10) * unit * magnification) / 1000 / SP_PER_BP : 0,
      depth: isBox && m[8] ? (parseInt(m[8], 10) * unit * magnification) / 1000 / SP_PER_BP : 0,
      page,
      kind: isBox ? 'box' : 'node',
    });
  }
  return { files, blocks };
};

export const parseSyncTex = (
  rawText: string,
  fallbackFile = 'unknown',
  projectPaths: string[] = []
): SyncTexIndex => {
  if (/^Content:/m.test(rawText) && /^SyncTeX Version:/m.test(rawText)) {
    return parseRealSyncTex(rawText, fallbackFile, projectPaths);
  }
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
