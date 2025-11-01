const { evaluateJsonPath } = require('./jsonPath');
const { clone } = require('./deepMerge');

function safeEvaluateJsonPath(data, path) {
  try {
    return evaluateJsonPath(data, path);
  } catch (error) {
    return [];
  }
}

function normalizeValue(value) {
  if (typeof value === 'object' && value !== null) {
    return clone(value);
  }
  return value;
}

function applyOutputFormat(format, data) {
  if (format === null || format === undefined) {
    return format;
  }

  if (typeof format === 'string') {
    const results = safeEvaluateJsonPath(data, format);
    if (results.length === 0) {
      return null;
    }
    if (results.length === 1) {
      return normalizeValue(results[0]);
    }
    return results.map((value) => normalizeValue(value));
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
