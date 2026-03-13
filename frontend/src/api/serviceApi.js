import api from './api';

export async function getServiceJobs(filters = {}) {
  const { data } = await api.get('/service', { params: filters });
  return data;
}

export async function createServiceJob(payload) {
  const { data } = await api.post('/service', payload);
  return data;
}

export async function updateServiceJob(jobId, payload) {
  const { data } = await api.patch(`/service/${jobId}`, payload);
  return data;
}

export async function getServiceJob(jobId) {
  const { data } = await api.get(`/service/${jobId}`);
  return data;
}

export async function completeServiceJob(jobId) {
  const { data } = await api.post(`/service/${jobId}/complete`);
  return data;
}
