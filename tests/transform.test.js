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
});
