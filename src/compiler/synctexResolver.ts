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
