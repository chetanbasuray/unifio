const { start, stop } = require('../src/server');

async function sendRequest(port, payload) {
  const response = await fetch(`http://127.0.0.1:${port}/v0/combine`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  return { response, body };
}

describe('POST /v0/combine', () => {
  let port;

  beforeEach(async () => {
    const serverInstance = await start(0);
    port = serverInstance.address().port;
  });

  afterEach(async () => {
    await stop();
  });

  test('merges JSON and XML payloads into a single response', async () => {
    const payload = {
      inputs: [
        { type: 'json', data: '{"user":{"name":"Alice","email":"alice@example.com"}}' },
        { type: 'xml', data: '<profile><age>30</age><preferences><newsletter>true</newsletter></preferences></profile>' },
      ],
    };

    const { response, body } = await sendRequest(port, payload);

    expect(response.status).toBe(200);
    expect(typeof body.result).toBe('string');
    expect(body.meta).toBeDefined();
    expect(body.meta).toMatchObject({
      truncated: false,
      maxDepthReached: false,
      outputTruncated: false,
    });
    expect(Array.isArray(body.meta.truncatedFields)).toBe(true);
    expect(new Date(body.meta.timestamp).toString()).not.toBe('Invalid Date');

    const decoded = JSON.parse(Buffer.from(body.result, 'base64').toString('utf8'));
    expect(decoded).toEqual({
      user: {
        name: 'Alice',
        email: 'alice@example.com',
      },
      profile: {
        age: '30',
        preferences: {
          newsletter: 'true',
        },
      },
    });
  });

  test('returns 400 when inputs array is missing or empty', async () => {
    const payload = { inputs: [] };
    const { response, body } = await sendRequest(port, payload);

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid input' });
  });

  test('applies output_format transformations using JSONPath', async () => {
    const payload = {
      inputs: [
        { type: 'json', data: '{"user":{"name":"Bob","age":42,"friends":[{"name":"Eve"}]}}' },
      ],
      output_format: {
        summary: {
          name: '$.user.name',
          firstFriend: '$.user.friends[0].name',
        },
      },
    };

    const { response, body } = await sendRequest(port, payload);

    expect(response.status).toBe(200);
    expect(body.meta).toMatchObject({
      truncated: false,
      maxDepthReached: false,
      outputTruncated: false,
    });
    const decoded = JSON.parse(Buffer.from(body.result, 'base64').toString('utf8'));
    expect(decoded).toEqual({
      summary: {
        name: 'Bob',
        firstFriend: 'Eve',
      },
    });
  });

  test('exposes truncation metadata when array results exceed the limit', async () => {
    const payload = {
      inputs: [
        {
          type: 'json',
          data: JSON.stringify({ items: Array.from({ length: 1505 }, (_, index) => index) }),
        },
      ],
      output_format: {
        limited: '$.items[*]',
      },
    };

    const { response, body } = await sendRequest(port, payload);

    expect(response.status).toBe(200);
    expect(body.meta.truncated).toBe(true);
    expect(body.meta.truncatedFields).toContain('limited');
    expect(body.meta.outputTruncated).toBe(false);
    expect(body.meta.maxDepthReached).toBe(false);
    const decoded = JSON.parse(Buffer.from(body.result, 'base64').toString('utf8'));
    expect(decoded.limited).toHaveLength(1000);
    expect(decoded.__meta).toEqual({
      truncated: true,
      truncatedField: 'limited',
      returnedItems: 1000,
    });
  });

  test('flags recursion depth in metadata when schema exceeds the limit', async () => {
    const buildNestedFormat = (depth, leaf) => {
      if (depth === 0) {
        return leaf;
      }
      return { nested: buildNestedFormat(depth - 1, leaf) };
    };

    const payload = {
      inputs: [
        { type: 'json', data: '{"user":{"name":"Dana"}}' },
      ],
      output_format: buildNestedFormat(12, '$.user.name'),
    };

    const { response, body } = await sendRequest(port, payload);

    expect(response.status).toBe(200);
    expect(body.meta.maxDepthReached).toBe(true);
    expect(body.meta.truncated).toBe(false);
    expect(body.meta.outputTruncated).toBe(false);
    const decoded = JSON.parse(Buffer.from(body.result, 'base64').toString('utf8'));
    const expected = buildNestedFormat(12, null);
    expect(decoded).toEqual(expected);
  });

  test('returns 400 when input type is unsupported', async () => {
    const payload = {
      inputs: [{ type: 'text', data: 'value' }],
    };

    const { response, body } = await sendRequest(port, payload);

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid input' });
  });

  test('returns 400 when data field is not a string', async () => {
    const payload = {
      inputs: [{ type: 'json', data: { name: 'Alice' } }],
    };

    const { response, body } = await sendRequest(port, payload);

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid input' });
  });

  test('accepts payloads within the size limit', async () => {
    const smallPayload = {
      inputs: [
        { type: 'json', data: JSON.stringify({ message: 'hello' }) },
      ],
    };

    const { response, body } = await sendRequest(port, smallPayload);

    expect(response.status).toBe(200);
    expect(typeof body.result).toBe('string');
    expect(body.meta).toMatchObject({
      truncated: false,
      maxDepthReached: false,
      outputTruncated: false,
    });
  });

  test('rejects payloads larger than 5MB', async () => {
    const largeData = 'a'.repeat(5 * 1024 * 1024 + 1);
    const payload = {
      inputs: [{ type: 'json', data: largeData }],
    };

    const { response, body } = await sendRequest(port, payload);

    expect(response.status).toBe(413);
    expect(body).toEqual({ error: 'Payload too large' });
  });

  test('hides internal error details from clients', async () => {
    const payload = {
      inputs: [{ type: 'json', data: '{"user":{"name":"Mallory"}}' }],
      output_format: {
        summary: {
          broken: '$.user[',
        },
      },
    };

    const { response, body } = await sendRequest(port, payload);

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Internal error' });
  });

  test('returns 413 when the combined output exceeds the size limit', async () => {
    const largeValue = 'a'.repeat(1_100_000);
    const payload = {
      inputs: [{ type: 'json', data: JSON.stringify({ big: largeValue }) }],
    };

    const { response, body } = await sendRequest(port, payload);

    expect(response.status).toBe(413);
    expect(body.error).toBe(
      'Output too large. Try narrowing your query or reducing array size.',
    );
    expect(body.meta).toMatchObject({
      truncated: false,
      maxDepthReached: false,
      outputTruncated: true,
    });
    expect(Array.isArray(body.meta.truncatedFields)).toBe(true);
    expect(new Date(body.meta.timestamp).toString()).not.toBe('Invalid Date');
  });

  test('accepts UTF-8 text payloads', async () => {
    const payload = {
      inputs: [{ type: 'json', data: JSON.stringify({ message: 'hello world' }) }],
    };

    const { response } = await sendRequest(port, payload);

    expect(response.status).toBe(200);
  });

  test('rejects inputs containing null bytes', async () => {
    const payload = {
      inputs: [{ type: 'json', data: 'hello\u0000world' }],
    };

    const { response, body } = await sendRequest(port, payload);

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'Invalid input encoding — only UTF-8 text is supported',
    });
  });

  test('rejects inputs with excessive non-printable characters', async () => {
    const binaryFragment = '\u0007'.repeat(20);
    const textFragment = 'a'.repeat(180);
    const payload = {
      inputs: [{ type: 'json', data: binaryFragment + textFragment }],
    };

    const { response, body } = await sendRequest(port, payload);

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'Invalid input encoding — only UTF-8 text is supported',
    });
  });
});
