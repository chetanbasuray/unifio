function tokenize(path) {
  if (typeof path !== 'string' || !path.startsWith('$')) {
    throw new Error('JSONPath must be a string starting with $');
  }

  const tokens = [];
  let i = 1; // skip $
  while (i < path.length) {
    const char = path[i];
    if (char === '.') {
      i += 1;
      let name = '';
      while (i < path.length && /[A-Za-z0-9_$]/.test(path[i])) {
        name += path[i];
        i += 1;
      }
      if (!name) {
        throw new Error(`Invalid token at position ${i} in JSONPath: ${path}`);
      }
      tokens.push({ type: 'property', name });
      continue;
    }

    if (char === '[') {
      i += 1;
      if (i >= path.length) {
        throw new Error(`Unterminated bracket in JSONPath: ${path}`);
      }
      if (path[i] === '\'' || path[i] === '"') {
        const quote = path[i];
        i += 1;
        let name = '';
        while (i < path.length && path[i] !== quote) {
          if (path[i] === '\\') {
            i += 1;
            if (i >= path.length) {
              throw new Error(`Invalid escape sequence in JSONPath: ${path}`);
            }
          }
          name += path[i];
          i += 1;
        }
        if (i >= path.length) {
          throw new Error(`Unterminated string token in JSONPath: ${path}`);
        }
        i += 1; // skip quote
        if (path[i] !== ']') {
          throw new Error(`Expected ] after property in JSONPath: ${path}`);
        }
        i += 1; // skip ]
        tokens.push({ type: 'property', name });
        continue;
      }

      let number = '';
      while (i < path.length && /[0-9-]/.test(path[i])) {
        number += path[i];
        i += 1;
      }
      if (!number) {
        throw new Error(`Invalid array index in JSONPath: ${path}`);
      }
      if (path[i] !== ']') {
        throw new Error(`Expected ] after array index in JSONPath: ${path}`);
      }
      i += 1;
      tokens.push({ type: 'index', index: Number(number) });
      continue;
    }

    throw new Error(`Unexpected character '${char}' in JSONPath: ${path}`);
  }

  return tokens;
}

function evaluateTokens(data, tokens) {
  let current = [data];
  for (const token of tokens) {
    const next = [];
    if (token.type === 'property') {
      for (const value of current) {
        if (value != null && Object.prototype.hasOwnProperty.call(value, token.name)) {
          next.push(value[token.name]);
        }
      }
    } else if (token.type === 'index') {
      for (const value of current) {
        if (Array.isArray(value)) {
          const { index } = token;
          const idx = index < 0 ? value.length + index : index;
          if (idx >= 0 && idx < value.length) {
            next.push(value[idx]);
          }
        }
      }
    }
    current = next;
  }
  return current;
}

function evaluateJsonPath(data, path) {
  const tokens = tokenize(path);
  return evaluateTokens(data, tokens);
}

module.exports = { evaluateJsonPath, tokenize };
