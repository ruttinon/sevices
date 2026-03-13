import axios from 'axios';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';
const RUNTIME_API_STORAGE_KEY = 'energy-services-api-base-url';
const DEFAULT_TIMEOUT_MS = 15000;

function normalizeApiBaseUrl(value) {
  if (!value) {
    return null;
  }

  const nextValue = String(value).trim().replace(/\/+$/, '');
  return nextValue || null;
}

function resolveRuntimeApiBaseUrl() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const queryValue = normalizeApiBaseUrl(params.get('apiBaseUrl'));
    if (queryValue) {
      window.localStorage.setItem(RUNTIME_API_STORAGE_KEY, queryValue);
      return queryValue;
    }

    return normalizeApiBaseUrl(window.localStorage.getItem(RUNTIME_API_STORAGE_KEY));
  } catch {
    return null;
  }
}

export const API_BASE_URL =
  resolveRuntimeApiBaseUrl()
  ?? normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
  ?? DEFAULT_API_BASE_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function getApiErrorMessage(error, fallbackMessage = 'เกิดข้อผิดพลาด') {
  const detail = error?.response?.data?.detail;
  if (detail) {
    return detail;
  }

  const status = error?.response?.status;
  if (status) {
    return `เกิดข้อผิดพลาดจากระบบ (${status})`;
  }

  const code = error?.code;
  if (code === 'ECONNABORTED') {
    return `เชื่อมต่อ API ช้าเกินไป (API: ${API_BASE_URL})`;
  }

  const message = String(error?.message || '').trim();
  if (code === 'ERR_NETWORK' || message.toLowerCase() === 'network error' || !message) {
    return `เชื่อมต่อ API ไม่ได้ (API: ${API_BASE_URL}) — โปรดรัน backend ที่พอร์ต 8000 หรือกำหนด VITE_API_BASE_URL / ใส่ ?apiBaseUrl=http://<ip>:8000`;
  }

  return message || fallbackMessage;
}

export function toAbsoluteFileUrl(filePath) {
  if (!filePath) {
    return '#';
  }
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  return `${API_BASE_URL}${filePath}`;
}

export default api;
