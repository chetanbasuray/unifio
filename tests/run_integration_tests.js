/* eslint-disable no-console */
const ENDPOINT = process.env.UNIFIO_ENDPOINT || 'https://unifio.vercel.app/v0/combine';

async function fetchImpl(...args) {
  if (typeof fetch === 'function') {
    return fetch(...args);
  }

  const module = await import('node-fetch');
  return module.default(...args);
}

async function sendRequest(payload) {
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function decodeResult(body) {
  if (!body || typeof body.result !== 'string') {
    throw new Error('Missing result payload');
  }
  const json = Buffer.from(body.result, 'base64').toString('utf8');
  return JSON.parse(json);
}

async function testBasicMerge() {
  const payload = {
    inputs: [
      { type: 'json', data: JSON.stringify({ user: { name: 'Alice', email: 'alice@example.com' } }) },
      { type: 'xml', data: '<profile><age>30</age><newsletter>true</newsletter></profile>' },
    ],
  };

  const { response, body } = await sendRequest(payload);
  if (response.status !== 200) {
    throw new Error(`Expected 200 but received ${response.status}: ${body.error}`);
  }

  const decoded = decodeResult(body);
  if (!decoded.user || decoded.user.name !== 'Alice' || decoded.profile.age !== '30') {
    throw new Error('Merged payload missing expected fields');
  }
}

async function testCsvSanitizer() {
  const payload = {
    inputs: [
      { type: 'csv', data: 'val\n=SUM(A1:A1)\n+2\nnormal' },
    ],
  };

  const { response, body } = await sendRequest(payload);
  if (response.status !== 200) {
    throw new Error(`CSV request failed: ${response.status} ${body.error}`);
  }

  const decoded = decodeResult(body);
  const values = decoded.rows.map((row) => row.val);
  if (values[0] !== "'=SUM(A1:A1)" || values[1] !== "'+2") {
    throw new Error(`CSV sanitization failed: ${values.join(', ')}`);
  }
}

async function testXmlXxeProtection() {
  const payload = {
    inputs: [
      {
        type: 'xml',
        data: `<?xml version="1.0"?>\n<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>\n<foo>&xxe;</foo>`,
      },
    ],
  };

  const { response, body } = await sendRequest(payload);
  if (response.status === 200) {
    const decoded = decodeResult(body);
    const serialized = JSON.stringify(decoded);
    if (serialized.includes('etc/passwd') || serialized.includes('&xxe;')) {
      throw new Error('XXE payload was expanded');
    }
  } else if (response.status !== 400 || !body.error.includes('Failed to parse inputs[0] (xml)')) {
    throw new Error(`Unexpected XML error response: ${response.status} ${body.error}`);
  }
}

async function testYamlExploitProtection() {
  const payload = {
    inputs: [
      { type: 'yaml', data: 'payload: !!js/function > function() { return process.env.SECRET; }' },
    ],
  };

  const { response, body } = await sendRequest(payload);
  if (response.status !== 400 || !body.error.includes('Failed to parse inputs[0] (yaml)')) {
    throw new Error(`YAML exploit was not rejected: ${response.status} ${body.error}`);
  }
}

async function testBinaryRejection() {
  const payload = {
    inputs: [
      { type: 'json', data: '"\u0000binary"' },
    ],
  };

  const { response, body } = await sendRequest(payload);
  if (response.status !== 400 || !body.error.includes('Invalid input encoding')) {
    throw new Error(`Binary payload was not rejected: ${response.status} ${body.error}`);
  }
}

async function testOutputTruncation() {
  const items = Array.from({ length: 1505 }, (_, index) => index);
  const payload = {
    inputs: [
      { type: 'json', data: JSON.stringify({ items }) },
    ],
    output_format: {
      limited: '$.items[*]',
    },
  };

  const { response, body } = await sendRequest(payload);
  if (response.status !== 200) {
    throw new Error(`Output truncation test failed: ${response.status} ${body.error}`);
  }

  const decoded = decodeResult(body);
  if (!Array.isArray(decoded.limited) || decoded.limited.length !== 1000) {
    throw new Error('Array truncation was not enforced');
  }
  if (!decoded.__meta || decoded.__meta.truncated !== true) {
    throw new Error('Truncation metadata missing from response');
  }
}

async function testRecursionDepthMeta() {
  const buildFormat = (depth) => {
    if (depth === 0) {
      return '$.value';
    }
    return { nested: buildFormat(depth - 1) };
  };

  const payload = {
    inputs: [
      { type: 'json', data: JSON.stringify({ value: 'secret' }) },
    ],
    output_format: buildFormat(12),
  };

  const { response, body } = await sendRequest(payload);
  if (response.status !== 200) {
    throw new Error(`Recursion depth test failed: ${response.status} ${body.error}`);
  }

  if (!body.meta || body.meta.maxDepthReached !== true) {
    throw new Error('maxDepthReached flag missing from metadata');
  }
}

const tests = [
  { name: 'Basic JSON/XML merge', fn: testBasicMerge },
  { name: 'CSV sanitizer escapes formulas', fn: testCsvSanitizer },
  { name: 'XML XXE protection', fn: testXmlXxeProtection },
  { name: 'YAML exploit protection', fn: testYamlExploitProtection },
  { name: 'Binary payload rejection', fn: testBinaryRejection },
  { name: 'Output truncation enforcement', fn: testOutputTruncation },
  { name: 'Recursion depth metadata', fn: testRecursionDepthMeta },
];

async function main() {
  const results = [];

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`PASS ${test.name}`);
      results.push({ name: test.name, success: true });
    } catch (error) {
      console.error(`FAIL ${test.name}: ${error.message}`);
      results.push({ name: test.name, success: false, error });
    }
  }

  const passed = results.filter((result) => result.success).length;
  const failed = results.length - passed;

  console.log('---');
  console.log(`Integration summary: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Unexpected integration test error: ${error.message}`);
  process.exit(1);
});
