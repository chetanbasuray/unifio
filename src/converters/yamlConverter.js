const YAML = require('yaml');

const yamlParseOptions = { customTags: [] };
const suspiciousYamlTagPattern = /(?:!![A-Za-z0-9_\/:-]+|![A-Za-z0-9_\/:-]+|!<[^>]*>)/;

function parseYaml(data) {
  if (typeof data !== 'string') {
    throw new Error('YAML input must be a string');
  }

  if (suspiciousYamlTagPattern.test(data)) {
    const parseError = new Error('Failed to parse YAML');
    parseError.cause = new Error('Unsafe YAML tag detected');
    throw parseError;
  }

  try {
    const parsed = YAML.parse(data, yamlParseOptions);
    return parsed ?? {};
  } catch (error) {
    const parseError = new Error('Failed to parse YAML');
    parseError.cause = error;
    throw parseError;
  }
}

module.exports = { parseYaml };
