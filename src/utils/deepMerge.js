function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function clone(value) {
  if (Array.isArray(value)) {
    return value.map((item) => clone(item));
  }
  if (isPlainObject(value)) {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = clone(value[key]);
    }
    return result;
  }
  return value;
}

function deepMerge(target, source) {
  if (target === undefined) {
    return clone(source);
  }

  if (source === undefined) {
    return clone(target);
  }

  if (Array.isArray(target) && Array.isArray(source)) {
    return [...target.map((item) => clone(item)), ...source.map((item) => clone(item))];
  }

  if (isPlainObject(target) && isPlainObject(source)) {
    const result = { ...clone(target) };
    for (const key of Object.keys(source)) {
      if (key in result) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = clone(source[key]);
      }
    }
    return result;
  }

  return clone(source);
}

module.exports = { deepMerge, clone, isPlainObject };
