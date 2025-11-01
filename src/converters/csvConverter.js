const { sanitizeCsvCell } = require('../utils/sanitize');

function isSanitizationEnabled() {
  const flag = process.env.CSV_SANITIZE;
  if (typeof flag !== 'string') {
    return true;
  }
  return flag.toLowerCase() !== 'false';
}

function parseCsv(data) {
  if (typeof data !== 'string') {
    throw new Error('CSV input must be a string');
  }

  const lines = data.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [] };
  }

  const headers = splitCsvLine(lines[0]);
  const rows = [];

  const sanitize = isSanitizationEnabled();

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      const rawValue = values[index] ?? '';
      row[header] = sanitize ? sanitizeCsvCell(rawValue) : rawValue;
    });
    rows.push(row);
  }

  return { rows };
}

function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((value) => value.trim());
}

module.exports = { parseCsv };
