const { applyOutputFormat } = require('../src/utils/transform');

describe('applyOutputFormat', () => {
  const sampleData = {
    user: { name: 'Alice', age: 30 },
    root: {
      projects: {
        project: [
          { name: 'Data Unifier' },
          { name: 'AI Toolkit' },
        ],
      },
    },
    rows: [
      { skill: 'Go' },
      { skill: 'Rust' },
    ],
  };

  test('returns simple field values for straightforward paths', () => {
    const format = {
      user_summary: {
        name: '$.user.name',
        age: '$.user.age',
      },
    };

    const result = applyOutputFormat(format, sampleData);

    expect(result).toEqual({
      user_summary: {
        name: 'Alice',
        age: 30,
      },
    });
  });

  test('returns arrays when JSONPath matches multiple results', () => {
    const format = {
      summary: {
        names: '$.root.projects.project[*].name',
        first_skill: '$.rows[0].skill',
      },
    };

    const result = applyOutputFormat(format, sampleData);

    expect(result).toEqual({
      summary: {
        names: ['Data Unifier', 'AI Toolkit'],
        first_skill: 'Go',
      },
    });
  });

  test('returns null when JSONPath is invalid or matches nothing', () => {
    const format = {
      missing: '$.root.projects[',
      absent: '$.user.hobbies[*]',
    };

    const result = applyOutputFormat(format, sampleData);

    expect(result).toEqual({
      missing: null,
      absent: null,
    });
  });

  test('returns null for branches exceeding the maximum recursion depth', () => {
    const buildNestedFormat = (depth, leaf) => {
      if (depth === 0) {
        return leaf;
      }
      return { nested: buildNestedFormat(depth - 1, leaf) };
    };

    const deepFormat = buildNestedFormat(12, '$.user.name');
    const result = applyOutputFormat(deepFormat, sampleData);

    const expected = buildNestedFormat(12, null);
    expect(result).toEqual(expected);
  });

  test('handles nested schemas within the recursion depth limit', () => {
    const format = {
      summary: {
        profile: {
          name: '$.user.name',
          age: '$.user.age',
        },
        skills: '$.rows[*].skill',
      },
    };

    const result = applyOutputFormat(format, sampleData);

    expect(result).toEqual({
      summary: {
        profile: {
          name: 'Alice',
          age: 30,
        },
        skills: ['Go', 'Rust'],
      },
    });
  });

  test('truncates arrays that exceed the maximum item limit and annotates metadata', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const format = {
        limited: '$.items[*]',
      };

      const sample = {
        items: Array.from({ length: 1500 }, (_, index) => index),
      };

      const result = applyOutputFormat(format, sample);

      expect(result.limited).toHaveLength(1000);
      expect(result.__meta).toEqual({
        truncated: true,
        truncatedField: 'limited',
        returnedItems: 1000,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        '[Unifio] Output truncated: limited capped at 1000 items.',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('leaves arrays within the limit untouched', () => {
    const format = {
      limited: '$.items[*]',
    };

    const sample = {
      items: Array.from({ length: 5 }, (_, index) => index),
    };

    const result = applyOutputFormat(format, sample);

    expect(result.limited).toEqual([0, 1, 2, 3, 4]);
    expect(result.__meta).toBeUndefined();
  });
});
