// Pure, DOM-free geometry helpers for Iconostat. No imports.

export function pickTopIndex(zIndexes) {
  let best = -1, bestZ = -Infinity;
  for (let i = 0; i < zIndexes.length; i++) {
    if (zIndexes[i] > bestZ) { bestZ = zIndexes[i]; best = i; }
  }
  return best;
}

export function cascadeOffset(index, headerHeight, isMobile) {
  const offset = headerHeight * index + 1;
  return isMobile ? offset / 2 : offset;
}
