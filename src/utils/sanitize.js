const DANGEROUS_PREFIXES = new Set(['=', '+', '-', '@']);

function sanitizeCsvCell(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }

  const firstCharacter = value[0];
  if (DANGEROUS_PREFIXES.has(firstCharacter)) {
    return `'${value}`;
  }

  return value;
}

module.exports = {
  sanitizeCsvCell,
  DANGEROUS_PREFIXES,
};
