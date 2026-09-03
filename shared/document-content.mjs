export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export function asBlocks(value) {
  return value && typeof value === 'object' && value.kind === 'blocks' && Array.isArray(value.blocks)
    ? value.blocks : typeof value === 'string' && value ? [{ id: 'legacy', type: 'text', text: value }] : [];
}
export function contentText(value) {
  return asBlocks(value).map(b => b.type === 'text' ? b.text : b.type === 'table' ? b.rows.map(row => row.join(' · ')).join('\n') : b.caption || b.file?.name || '').join('\n');
}
export function validateContent(value) {
  if (!value || typeof value !== 'object' || value.kind !== 'blocks') return;
  if (!Array.isArray(value.blocks) || value.blocks.length > 100) throw new Error('Invalid document blocks.');
  for (const block of value.blocks) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length <= 100000) continue;
    if (block.type === 'table' && Array.isArray(block.rows) && block.rows.length <= 100 && block.rows.every(row => Array.isArray(row) && row.length <= 20 && row.every(cell => typeof cell === 'string' && cell.length <= 10000))) continue;
    if (['image','file'].includes(block.type) && /^[0-9a-f-]{36}$/i.test(block.file?.id || '') && typeof block.caption === 'string') continue;
    throw new Error('Invalid document content.');
  }
}
