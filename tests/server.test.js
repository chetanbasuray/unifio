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
    const decoded = JSON.parse(Buffer.from(body.result, 'base64').toString('utf8'));
    expect(decoded).toEqual({
      summary: {
        name: 'Bob',
        firstFriend: 'Eve',
      },
    });
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
});
