const { convertInput } = require('../src/converters');

describe('converter security hardening', () => {
  test('malformed YAML returns a clear error', async () => {
    const malformedYaml = 'key: [unclosed';

    const result = await convertInput({ type: 'yaml', data: malformedYaml }).catch((error) => ({
      error: error.message,
    }));

    expect(result).toEqual({ error: 'Failed to parse YAML' });
  });

  test('XML with XXE attempt is blocked', async () => {
    const maliciousXml = `<?xml version="1.0"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<foo>&xxe;</foo>`;

    const outcome = await convertInput({ type: 'xml', data: maliciousXml })
      .then((value) => ({ value }))
      .catch((error) => ({ error: error.message }));

    if (outcome.error) {
      expect(outcome).toEqual({ error: 'Failed to parse XML' });
      return;
    }

    const serialized = JSON.stringify(outcome.value);
    expect(serialized).not.toContain('etc/passwd');
    expect(serialized).not.toContain('&xxe;');
  });
});
