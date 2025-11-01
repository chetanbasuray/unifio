function parseJson(data) {
  if (typeof data !== 'string') {
    throw new Error('JSON input must be a string');
  }
  return JSON.parse(data);
}

module.exports = { parseJson };
