const BARCODE_FORMATS = [
  'data_matrix',
  'aztec',
  'qr_code',
  'pdf417',
  'code_128',
  'code_39',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'codabar',
  'itf',
];

function uniqueValues(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export async function detectBarcodeValuesFromFile(file) {
  if (!file || !('BarcodeDetector' in window) || typeof createImageBitmap !== 'function') {
    return [];
  }

  try {
    let formats = BARCODE_FORMATS;
    if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
      const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
      formats = BARCODE_FORMATS.filter((format) => supportedFormats.includes(format));
      if (formats.length === 0) return [];
    }

    const detector = new window.BarcodeDetector({ formats });
    const bitmap = await createImageBitmap(file);
    try {
      const detectedCodes = await detector.detect(bitmap);
      return uniqueValues(detectedCodes.map((code) => code.rawValue));
    } finally {
      if (typeof bitmap.close === 'function') {
        bitmap.close();
      }
    }
  } catch {
    return [];
  }
}
