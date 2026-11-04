import type { SyncTexIndex } from '../types/workspace';

export const resolveSyncTexPosition = (
  index: SyncTexIndex,
  page: number,
  xPt: number,
  yPt: number,
  tolerancePt = 10
): { file: string; line: number } | null => {
  let bestMatch: { file: string; line: number; distance: number } | null = null;
  const pageBlocks = index.blocks.filter((block) => block.page === page);
  const preciseBlocks = pageBlocks.filter((block) => block.width === 0 && block.height === 0);
  const blocks = preciseBlocks.length > 0 ? preciseBlocks : pageBlocks;

  for (const block of blocks) {
    const dx = block.width > 0
      ? Math.max(block.x - xPt, 0, xPt - (block.x + block.width))
      : Math.abs(xPt - block.x);
    const dy = block.height > 0
      ? Math.max(block.y - yPt, 0, yPt - (block.y + block.height))
      : Math.abs(yPt - block.y);
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= tolerancePt && (!bestMatch || distance < bestMatch.distance)) {
      bestMatch = { file: block.file, line: block.line, distance };
    }
  }

  return bestMatch ? { file: bestMatch.file, line: bestMatch.line } : null;
};

export const resolveSyncTexSource = (
  index: SyncTexIndex,
  file: string,
  line: number
): { page: number; x: number; y: number } | null => {
  if (!index?.blocks || index.blocks.length === 0) return null;

  const normalize = (f: string) => f.replace(/^\.\//, '').trim();
  const targetNorm = normalize(file);

  const fileBlocks = index.blocks.filter((b) => {
    const bNorm = normalize(b.file);
    return bNorm === targetNorm || bNorm.endsWith('/' + targetNorm) || targetNorm.endsWith('/' + bNorm);
  });

  const searchBlocks = fileBlocks.length > 0 ? fileBlocks : index.blocks;

  let bestBlock: (typeof index.blocks)[0] | null = null;
  let minDiff = Infinity;

  for (const block of searchBlocks) {
    const diff = Math.abs(block.line - line);
    if (diff < minDiff) {
      minDiff = diff;
      bestBlock = block;
      if (diff === 0) break;
    }
  }

  if (!bestBlock) return null;
  return { page: bestBlock.page, x: bestBlock.x, y: bestBlock.y };
};
