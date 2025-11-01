const { JSONPath } = require('jsonpath-plus');

function evaluateJsonPath(data, path) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('JSONPath must be a non-empty string');
  }

  return JSONPath({
    path,
    json: data,
    wrap: true,
    resultType: 'value',
    preventEval: true,
  });
}

module.exports = { evaluateJsonPath };
