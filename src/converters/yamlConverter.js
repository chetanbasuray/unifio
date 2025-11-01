function parseYaml(data) {
  if (typeof data !== 'string') {
    throw new Error('YAML input must be a string');
  }

  const lines = data.split(/\r?\n/);
  const stack = [{ indent: -1, value: {} }];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const originalLine = lines[idx];
    const lineWithoutComments = originalLine.replace(/#.*/, '');
    if (!lineWithoutComments.trim()) {
      continue;
    }

    const indent = countIndent(lineWithoutComments);
    const trimmed = lineWithoutComments.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].value;
    if (typeof parent !== 'object' || parent === null || Array.isArray(parent)) {
      throw new Error('Invalid YAML structure');
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid YAML line: ${trimmed}`);
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const rest = trimmed.slice(colonIndex + 1).trim();

    if (rest === '') {
      parent[key] = {};
      stack.push({ indent, value: parent[key] });
    } else {
      parent[key] = parseScalar(rest);
    }
  }

  return stack[0].value;
}

function parseScalar(value) {
  if (value === 'null' || value === 'NULL') {
    return null;
  }
  if (value === 'true' || value === 'True' || value === 'TRUE') {
    return true;
  }
  if (value === 'false' || value === 'False' || value === 'FALSE') {
    return false;
  }
  if (!Number.isNaN(Number(value))) {
    return Number(value);
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    return value.slice(1, -1);
  }
  return value;
}

function countIndent(line) {
  let count = 0;
  for (const char of line) {
    if (char === ' ') {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

module.exports = { parseYaml };
