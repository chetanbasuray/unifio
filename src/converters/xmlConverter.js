const { parseStringPromise } = require('xml2js');

const safeXmlOptions = {
  explicitArray: false,
  explicitRoot: true,
  normalizeTags: true,
  normalize: true,
  attrkey: '@attributes',
  charkey: '#text',
};

async function parseXml(data) {
  if (typeof data !== 'string') {
    throw new Error('XML input must be a string');
  }

  if (!data.trim()) {
    return {};
  }

  try {
    const parsed = await parseStringPromise(data, safeXmlOptions);
    return parsed ?? {};
  } catch (error) {
    const parseError = new Error('Failed to parse XML');
    parseError.cause = error;
    throw parseError;
  }
}

module.exports = { parseXml };
