const { test } = require('node:test');
const assert = require('node:assert/strict');
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

test('combines multiple data sources and returns merged output', { concurrency: false }, async (t) => {
  const serverInstance = await start(0);
  const port = serverInstance.address().port;
  t.after(async () => {
    await stop();
  });

  const payload = {
    inputs: [
      { type: 'json', data: '{"name":"Alice","location":{"city":"Paris"}}' },
      { type: 'csv', data: 'hobby,level\nreading,high' },
      { type: 'yaml', data: 'age: 30' },
    ],
  };

  const { response, body } = await sendRequest(port, payload);
  assert.equal(response.status, 200);
  assert.ok(body.result);
  const decoded = JSON.parse(Buffer.from(body.result, 'base64').toString('utf8'));
  assert.equal(decoded.name, 'Alice');
  assert.equal(decoded.location.city, 'Paris');
  assert.deepEqual(decoded.rows, [{ hobby: 'reading', level: 'high' }]);
  assert.equal(decoded.age, 30);
});

test('applies output_format transformations using JSONPath', { concurrency: false }, async (t) => {
  const serverInstance = await start(0);
  const port = serverInstance.address().port;
  t.after(async () => {
    await stop();
  });

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
  assert.equal(response.status, 200);
  const decoded = JSON.parse(Buffer.from(body.result, 'base64').toString('utf8'));
  assert.deepEqual(decoded, {
    summary: {
      name: 'Bob',
      firstFriend: 'Eve',
    },
  });
});

test('returns 400 for missing inputs array', { concurrency: false }, async (t) => {
  const serverInstance = await start(0);
  const port = serverInstance.address().port;
  t.after(async () => {
    await stop();
  });

  const payload = { inputs: [] };
  const { response, body } = await sendRequest(port, payload);
  assert.equal(response.status, 400);
  assert.equal(body.error, 'Invalid input');
});

test('returns 400 when input type is unsupported', { concurrency: false }, async (t) => {
  const serverInstance = await start(0);
  const port = serverInstance.address().port;
  t.after(async () => {
    await stop();
  });

  const payload = { inputs: [{ type: 'text', data: 'value' }] };
  const { response, body } = await sendRequest(port, payload);
  assert.equal(response.status, 400);
  assert.equal(body.error, 'Invalid input');
});

test('returns 400 when data field is not a string', { concurrency: false }, async (t) => {
  const serverInstance = await start(0);
  const port = serverInstance.address().port;
  t.after(async () => {
    await stop();
  });

  const payload = { inputs: [{ type: 'json', data: { name: 'Alice' } }] };
  const { response, body } = await sendRequest(port, payload);
  assert.equal(response.status, 400);
  assert.equal(body.error, 'Invalid input');
});
