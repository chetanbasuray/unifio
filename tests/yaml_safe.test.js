const { parseYaml } = require('../src/converters/yamlConverter');

describe('parseYaml security checks', () => {
  it('rejects YAML documents containing custom tags', () => {
    const unsafeYaml = 'malicious: !!js/function >\n  () => alert(1)';

    expect(() => parseYaml(unsafeYaml)).toThrowError('Failed to parse YAML');
  });

  it('rejects YAML documents containing !<...> tags', () => {
    const unsafeYaml = 'payload: !<tag:yaml.org,2002:js/function> "() => 1"';

    expect(() => parseYaml(unsafeYaml)).toThrowError('Failed to parse YAML');
  });

  it('parses standard YAML documents', () => {
    const safeYaml = 'a: 1\nb: 2';

    expect(parseYaml(safeYaml)).toEqual({ a: 1, b: 2 });
  });
});
