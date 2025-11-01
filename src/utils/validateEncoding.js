const DEFAULT_THRESHOLD = 0.05;

function getThreshold() {
  const raw = process.env.ENCODING_NONPRINTABLE_THRESHOLD;
  if (!raw) {
    return DEFAULT_THRESHOLD;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    return DEFAULT_THRESHOLD;
  }

  return value;
}

function isLikelyText(str) {
  if (typeof str !== 'string') {
    return false;
  }

  if (str.length === 0) {
    return true;
  }

  const sample = str.slice(0, 1000);
  const threshold = getThreshold();
  let nonPrintable = 0;

  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index);
    if (code === 0 || code < 9 || (code > 13 && code < 32)) {
      nonPrintable += 1;
    }
  }

  const ratio = nonPrintable / sample.length;
  return ratio < threshold;
}

module.exports = {
  isLikelyText,
};
