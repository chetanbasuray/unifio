const { applyOutputFormat, MAX_ARRAY_ITEMS } = require('../src/utils/transform');

describe('applyOutputFormat', () => {
  const sampleData = {
    user: { name: 'Alice', age: 30 },
    rows: [
      { skill: 'Go' },
      { skill: 'Rust' },
    ],
    items: Array.from({ length: MAX_ARRAY_ITEMS + 10 }, (_, index) => index),
  };

  it('extracts scalar fields with JSONPath expressions', () => {
    const format = {
      summary: {
        name: '$.user.name',
        age: '$.user.age',
      },
    };

    const result = applyOutputFormat(format, sampleData);

    expect(result).toEqual({
      summary: {
        name: 'Alice',
        age: 30,
      },
    });
  });

  it('returns null when JSONPath finds no results', () => {
    const format = {
      missing: '$.user.address.street',
    };

    const result = applyOutputFormat(format, sampleData);

    expect(result).toEqual({ missing: null });
  });

  it('truncates over-sized arrays and annotates metadata', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const format = {
      limited: '$.items[*]',
    };

    const result = applyOutputFormat(format, sampleData);

    expect(result.limited).toHaveLength(MAX_ARRAY_ITEMS);
    expect(result.__meta).toEqual({
      truncated: true,
      truncatedField: 'limited',
      returnedItems: MAX_ARRAY_ITEMS,
    });
    expect(warn).toHaveBeenCalledWith(
      `[Unifio] Output truncated: limited capped at ${MAX_ARRAY_ITEMS} items.`,
    );

    warn.mockRestore();
  });

  it('stops evaluation when recursion depth limit is exceeded', () => {
    const buildFormat = (depth) => {
      if (depth === 0) {
        return '$.user.name';
      }
      return { nested: buildFormat(depth - 1) };
    };

    const deepFormat = buildFormat(12);
    const result = applyOutputFormat(deepFormat, sampleData);

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
