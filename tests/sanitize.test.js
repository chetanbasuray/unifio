const { sanitizeCsvCell } = require('../src/utils/sanitize');
const { isLikelyText } = require('../src/utils/validateEncoding');
const { applyOutputFormat, MAX_ARRAY_ITEMS } = require('../src/utils/transform');

describe('sanitizeCsvCell', () => {
  it('escapes dangerous CSV formula prefixes', () => {
    expect(sanitizeCsvCell('=SUM(A1:A1)')).toBe("'=SUM(A1:A1)");
    expect(sanitizeCsvCell('+2')).toBe("'+2");
    expect(sanitizeCsvCell('-3')).toBe("'-3");
    expect(sanitizeCsvCell('@cmd')).toBe("'@cmd");
  });

  it('leaves benign values untouched', () => {
    expect(sanitizeCsvCell('normal')).toBe('normal');
    expect(sanitizeCsvCell('')).toBe('');
    expect(sanitizeCsvCell(42)).toBe(42);
  });
});

describe('isLikelyText', () => {
  it('accepts regular UTF-8 text', () => {
    expect(isLikelyText('Hello, world!')).toBe(true);
    expect(isLikelyText('こんにちは世界')).toBe(true);
  });

  it('rejects binary-like payloads', () => {
    const binaryString = `\u0000\u0001\u0002\u0003binary`; // contains non-printable characters
    expect(isLikelyText(binaryString)).toBe(false);
    expect(isLikelyText({})).toBe(false);
  });
});

describe('applyOutputFormat', () => {
  it('truncates arrays that exceed the configured maximum', () => {
    const data = { items: Array.from({ length: MAX_ARRAY_ITEMS + 5 }, (_, index) => index) };
    const format = { limited: '$.items[*]' };

    const result = applyOutputFormat(format, data);

    expect(Array.isArray(result.limited)).toBe(true);
    expect(result.limited.length).toBe(MAX_ARRAY_ITEMS);
    expect(result.__meta).toEqual({
      truncated: true,
      truncatedField: 'limited',
      returnedItems: MAX_ARRAY_ITEMS,
    });
  });

  it('returns null when the recursion depth limit is reached', () => {
    const buildFormat = (depth) => {
      if (depth === 0) {
        return '$.value';
      }
      return { nested: buildFormat(depth - 1) };
    };

    const format = buildFormat(12);
    const data = { value: 'secret' };

    const result = applyOutputFormat(format, data);

    let current = result;
    let depth = 0;
    while (current && typeof current === 'object' && 'nested' in current) {
      depth += 1;
      if (depth > 11) {
        break;
      }
      current = current.nested;
    }

    expect(current).toBeNull();
  });
});
