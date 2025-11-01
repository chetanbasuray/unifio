const { evaluateJsonPath } = require('./jsonPath');
const { clone } = require('./deepMerge');

function applyOutputFormat(format, data) {
  if (format === null || format === undefined) {
    return format;
  }

  if (typeof format === 'string') {
    const results = evaluateJsonPath(data, format);
    if (results.length === 0) {
      return null;
    }
    if (results.length === 1) {
      const value = results[0];
      return typeof value === 'object' && value !== null ? clone(value) : value;
    }
    return results.map((value) => (typeof value === 'object' && value !== null ? clone(value) : value));
  }

  if (Array.isArray(format)) {
    return format.map((item) => applyOutputFormat(item, data));
  }

  if (typeof format === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(format)) {
      result[key] = applyOutputFormat(value, data);
    }
    return result;
  }

  return format;
}

module.exports = { applyOutputFormat };
