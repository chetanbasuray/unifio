const YAML = require('yaml');

const yamlParseOptions = { customTags: [] };

function parseYaml(data) {
  if (typeof data !== 'string') {
    throw new Error('YAML input must be a string');
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
