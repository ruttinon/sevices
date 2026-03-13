import api from './api';
import { detectBarcodeValuesFromFile } from '../utils/barcodeImageScan';

function normalizeCandidate(value) {
  return String(value ?? '').trim();
}

function pushCandidate(target, seen, value) {
  const normalized = normalizeCandidate(value);
  if (!normalized) return;

  const dedupeKey = normalized.toLowerCase();
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  target.push(normalized);
}

function buildImageSearchTerms(result, barcodeValues = [], hintText = '') {
  const terms = [];
  const seen = new Set();
  const fieldHints = result?.field_hints ?? {};

  pushCandidate(terms, seen, result?.extracted_text);
  pushCandidate(terms, seen, fieldHints.reference_number);
  pushCandidate(terms, seen, fieldHints.serial_number);
  pushCandidate(terms, seen, fieldHints.meter_code);
  pushCandidate(terms, seen, fieldHints.device_address);

  for (const value of barcodeValues) {
    pushCandidate(terms, seen, value);
  }
  for (const value of result?.candidates ?? []) {
    pushCandidate(terms, seen, value);
  }
  for (const value of result?.ocr_texts ?? []) {
    pushCandidate(terms, seen, value);
  }

  pushCandidate(terms, seen, hintText);
  return terms;
}

export async function scanQr(code, options = {}) {
  const { data } = await api.get(`/scan/qr/${encodeURIComponent(code)}`, {
    params: options,
  });
  return data;
}

export async function scanOcr(text, options = {}) {
  const { data } = await api.post('/scan/ocr', { text }, {
    params: options,
  });
  return data;
}

export async function scanOcrImage(file, hintText = '', options = {}) {
  const normalizedHint = String(hintText ?? '').trim();
  const barcodeValues = await detectBarcodeValuesFromFile(file);

  try {
    const extracted = await scanOcrExtract(file, normalizedHint, options);
    const searchTerms = buildImageSearchTerms(extracted, barcodeValues, normalizedHint);
    if (searchTerms.length) {
      return await findMatchesFromTerms(searchTerms, options);
    }
  } catch (extractError) {
    if (normalizedHint) {
      return await scanOcr(normalizedHint, options);
    }
    if (barcodeValues.length) {
      return await findMatchesFromTerms(barcodeValues, options);
    }
    throw extractError;
  }

  if (normalizedHint) {
    return await scanOcr(normalizedHint, options);
  }
  if (barcodeValues.length) {
    return await findMatchesFromTerms(barcodeValues, options);
  }
  throw new Error('No equipment matched this OCR image');
}

export async function scanOcrExtract(file, hintText = '', options = {}) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('hint_text', hintText);
  if (options.project_id) {
    formData.append('project_id', options.project_id);
  }

  const { data } = await api.post('/scan/ocr/extract', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}

async function findMatchesFromTerms(terms, options = {}) {
  let lastError = null;

  for (const term of terms) {
    try {
      const results = await manualSearch(term, options);
      if (results.length) {
        return results;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('No equipment matched this OCR image');
}

export async function manualSearch(query, options = {}) {
  const { data } = await api.get('/scan/search', {
    params: { q: query, ...options },
  });
  return data;
}
