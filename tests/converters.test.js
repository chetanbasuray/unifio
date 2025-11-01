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

  test('CSV inputs sanitize potentially dangerous cells by default', async () => {
    const csvData = [
      'col_formula,col_plain,col_cmd',
      "=SUM(A1:A2),normalText,\"@cmd|'/C calc'\"",
    ].join('\n');

    const result = await convertInput({ type: 'csv', data: csvData });

    expect(result.rows).toEqual([
      {
        col_formula: "'=SUM(A1:A2)",
        col_plain: 'normalText',
        col_cmd: "'@cmd|'/C calc'",
      },
    ]);
  });

  test('CSV sanitization can be disabled for trusted environments', async () => {
    const previous = process.env.CSV_SANITIZE;
    process.env.CSV_SANITIZE = 'false';

    try {
      const csvData = ['value', '=1+1'].join('\n');
      const result = await convertInput({ type: 'csv', data: csvData });

      expect(result.rows[0].value).toBe('=1+1');
    } finally {
      if (previous === undefined) {
        delete process.env.CSV_SANITIZE;
      } else {
        process.env.CSV_SANITIZE = previous;
      }
    }
  });
});
