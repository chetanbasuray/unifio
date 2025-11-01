function parseXml(data) {
  if (typeof data !== 'string') {
    throw new Error('XML input must be a string');
  }

  const cleaned = data.replace(/<\?xml[^>]*>/g, '').trim();
  if (!cleaned) {
    return {};
  }

  const tokens = tokenize(cleaned);
  const rootStack = [];
  const valueStack = [];

  for (const token of tokens) {
    if (token.type === 'start') {
      const node = { name: token.name, attributes: token.attributes, children: [] };
      valueStack.push(node);
    } else if (token.type === 'text') {
      if (valueStack.length === 0) {
        throw new Error('Unexpected text outside XML root');
      }
      const text = token.value;
      if (text.trim().length === 0) {
        continue;
      }
      valueStack[valueStack.length - 1].children.push({ type: 'text', value: text });
    } else if (token.type === 'end') {
      const node = valueStack.pop();
      if (!node || node.name !== token.name) {
        throw new Error(`Mismatched closing tag: ${token.name}`);
      }
      const converted = buildNode(node);
      if (valueStack.length === 0) {
        rootStack.push({ name: node.name, value: converted });
      } else {
        valueStack[valueStack.length - 1].children.push({ type: 'node', name: node.name, value: converted });
      }
    } else if (token.type === 'selfClosing') {
      const converted = buildNode({ name: token.name, attributes: token.attributes, children: [] });
      if (valueStack.length === 0) {
        rootStack.push({ name: token.name, value: converted });
      } else {
        valueStack[valueStack.length - 1].children.push({ type: 'node', name: token.name, value: converted });
      }
    }
  }

  if (valueStack.length !== 0) {
    throw new Error('Invalid XML: unmatched tags');
  }

  if (rootStack.length === 1) {
    return { [rootStack[0].name]: rootStack[0].value };
  }

  const result = {};
  for (const entry of rootStack) {
    if (result[entry.name]) {
      if (!Array.isArray(result[entry.name])) {
        result[entry.name] = [result[entry.name]];
      }
      result[entry.name].push(entry.value);
    } else {
      result[entry.name] = entry.value;
    }
  }
  return result;
}

function buildNode(node) {
  const hasChildren = node.children.some((child) => child.type === 'node');
  const hasText = node.children.some((child) => child.type === 'text');
  let value;

  if (!hasChildren && !hasText) {
    value = {};
  } else if (!hasChildren && hasText) {
    const texts = node.children.filter((child) => child.type === 'text').map((child) => child.value.trim());
    value = texts.join(' ');
  } else {
    value = {};
    for (const child of node.children) {
      if (child.type === 'text') {
        const textValue = child.value.trim();
        if (!textValue) {
          continue;
        }
        if (value._text) {
          value._text = `${value._text} ${textValue}`.trim();
        } else {
          value._text = textValue;
        }
      } else if (child.type === 'node') {
        if (Object.prototype.hasOwnProperty.call(value, child.name)) {
          if (!Array.isArray(value[child.name])) {
            value[child.name] = [value[child.name]];
          }
          value[child.name].push(child.value);
        } else {
          value[child.name] = child.value;
        }
      }
    }
  }

  if (node.attributes && Object.keys(node.attributes).length > 0) {
    const attrObject = {};
    for (const [key, attrValue] of Object.entries(node.attributes)) {
      attrObject[`@${key}`] = attrValue;
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return { ...attrObject, ...value };
    }
    if (value === undefined) {
      return attrObject;
    }
    return { ...attrObject, _value: value };
  }

  return value;
}

function tokenize(xml) {
  const tokens = [];
  const regex = /<([^>]+)>|([^<]+)/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    if (match[1]) {
      const tagContent = match[1].trim();
      if (tagContent.startsWith('!')) {
        continue;
      }
      if (tagContent.startsWith('/')) {
        tokens.push({ type: 'end', name: tagContent.slice(1).trim() });
        continue;
      }
      const selfClosing = tagContent.endsWith('/');
      const raw = selfClosing ? tagContent.slice(0, -1).trim() : tagContent;
      const { name, attributes } = parseTag(raw);
      if (selfClosing) {
        tokens.push({ type: 'selfClosing', name, attributes });
      } else {
        tokens.push({ type: 'start', name, attributes });
      }
    } else if (match[2]) {
      tokens.push({ type: 'text', value: match[2] });
    }
  }
  return tokens;
}

function parseTag(content) {
  const parts = content.split(/\s+/);
  const name = parts.shift();
  const attributes = {};
  for (const part of parts) {
    const [attrName, attrValue] = part.split('=');
    if (!attrName) {
      continue;
    }
    if (!attrValue) {
      attributes[attrName] = '';
    } else {
      const cleaned = attrValue.replace(/^['\"]|['\"]$/g, '');
      attributes[attrName] = cleaned;
    }
  }
  return { name, attributes };
}

module.exports = { parseXml };
