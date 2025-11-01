const { evaluateJsonPath } = require('./jsonPath');
const { clone } = require('./deepMerge');

const MAX_DEPTH = 10;
const MAX_ARRAY_ITEMS = parseInt(process.env.MAX_ARRAY_ITEMS || '1000', 10);
const MAX_OUTPUT_BYTES = parseInt(process.env.MAX_OUTPUT_BYTES || '1000000', 10);

function createOutputMeta() {
  return {
    truncated: false,
    truncatedFields: new Set(),
    maxDepthReached: false,
    outputTruncated: false,
  };
}

function formatOutputMeta(meta) {
  const tracker = meta || createOutputMeta();
  const fieldsSource = tracker.truncatedFields || [];
  const fields =
    typeof fieldsSource.values === 'function'
      ? Array.from(fieldsSource.values())
      : Array.from(fieldsSource);

  return {
    truncated: Boolean(tracker.truncated),
    truncatedFields: fields,
    maxDepthReached: Boolean(tracker.maxDepthReached),
    outputTruncated: Boolean(tracker.outputTruncated),
    timestamp: tracker.timestamp ? String(tracker.timestamp) : undefined,
  };
}

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

function attachTruncationMeta(target, key, meta) {
  if (!target || typeof target !== 'object') {
    return;
  }

  if (!target.__meta) {
    target.__meta = {};
  }

  target.__meta.truncated = true;
  target.__meta.truncatedField = key != null ? String(key) : 'root';
  target.__meta.returnedItems = MAX_ARRAY_ITEMS;

  if (meta) {
    meta.truncated = true;
    if (meta.truncatedFields instanceof Set) {
      meta.truncatedFields.add(target.__meta.truncatedField);
    } else if (Array.isArray(meta.truncatedFields)) {
      if (!meta.truncatedFields.includes(target.__meta.truncatedField)) {
        meta.truncatedFields.push(target.__meta.truncatedField);
      }
    }
  }
}

function applyOutputFormat(
  format,
  data,
  depth = 0,
  parent = null,
  parentKey = null,
  meta,
) {
  const tracker = meta || createOutputMeta();
  // Guard against runaway recursion to keep evaluation predictable and safe.
  if (depth > MAX_DEPTH) {
    tracker.maxDepthReached = true;
    return null;
  }

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
    const truncated = results.length > MAX_ARRAY_ITEMS;
    const limitedResults = truncated
      ? results.slice(0, MAX_ARRAY_ITEMS)
      : results;
    const normalized = limitedResults.map((value) => normalizeValue(value));

    if (truncated) {
      const field = parentKey != null ? parentKey : 'root';
      const metaTarget = parent && typeof parent === 'object' ? parent : normalized;
      attachTruncationMeta(metaTarget, field, tracker);
      // eslint-disable-next-line no-console
      console.warn(
        `[Unifio] Output truncated: ${field} capped at ${MAX_ARRAY_ITEMS} items.`,
      );
    }

    return normalized;
  }

  if (Array.isArray(format)) {
    const result = [];
    for (let index = 0; index < format.length; index += 1) {
      result[index] = applyOutputFormat(
        format[index],
        data,
        depth + 1,
        result,
        index,
        tracker,
      );
    }
    return result;
  }

  if (typeof format === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(format)) {
      result[key] = applyOutputFormat(value, data, depth + 1, result, key, tracker);
    }
    return result;
  }

  return format;
}

module.exports = {
  applyOutputFormat,
  MAX_ARRAY_ITEMS,
  MAX_OUTPUT_BYTES,
  createOutputMeta,
  formatOutputMeta,
};
