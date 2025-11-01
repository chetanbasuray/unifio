const { parseJson } = require('./jsonConverter');
const { parseXml } = require('./xmlConverter');
const { parseCsv } = require('./csvConverter');
const { parseYaml } = require('./yamlConverter');

async function convertInput(input) {
  const { type, data } = input;
  if (typeof type !== 'string') {
    throw new Error('Input type must be a string');
  }
  const normalizedType = type.toLowerCase();
  switch (normalizedType) {
    case 'json':
      return parseJson(data);
    case 'xml':
      return parseXml(data);
    case 'csv':
      return parseCsv(data);
    case 'yaml':
    case 'yml':
      return parseYaml(data);
    default:
      throw new Error(`Unsupported input type: ${type}`);
  }
}

module.exports = { convertInput };
