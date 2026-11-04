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

  // Real SyncTeX output: nodes are anchored at their baseline (top-left origin,
  // PDF points). Find the visual line closest to the click, then the node at or
  // immediately left of the click on that line.
  const nodes = pageBlocks.filter((b) => b.kind === 'node');
  if (nodes.length > 0) {
    const bandDy = (b: { y: number }) =>
      Math.max(0, b.y - 11 - yPt, yPt - (b.y + 3));
    let minDy = Infinity;
    for (const n of nodes) minDy = Math.min(minDy, bandDy(n));
    if (minDy > Math.max(tolerancePt, 24)) return null;
    const lineNodes = nodes.filter((n) => bandDy(n) <= minDy + 0.5);
    const left = lineNodes.filter((n) => n.x <= xPt);
    const pick = left.length > 0
      ? left.reduce((a, b) => (b.x >= a.x ? b : a))
      : lineNodes.reduce((a, b) => (b.x < a.x ? b : a));
    return { file: pick.file, line: pick.line };
  }
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
