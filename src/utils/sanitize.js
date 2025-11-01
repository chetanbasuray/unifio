function sanitizeCsvCell(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }

  const first = value[0];
  if (['=', '+', '-', '@'].includes(first)) {
    return "'" + value;
  }

  return value;
}

module.exports = { sanitizeCsvCell };
