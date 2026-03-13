import api from './api';

export async function getCustomers() {
  const { data } = await api.get('/customers');
  return data;
}

export async function createCustomer(payload) {
  const { data } = await api.post('/customers', payload);
  return data;
}

export async function getProjects() {
  const { data } = await api.get('/projects');
  return data;
}

export async function createProject(payload) {
  const { data } = await api.post('/projects', payload);
  return data;
}

export async function updateProject(projectId, payload) {
  const { data } = await api.put(`/projects/${projectId}`, payload);
  return data;
}

export async function getProject(projectId) {
  const { data } = await api.get(`/projects/${projectId}`);
  return data;
}

export async function getProjectPublic(projectId) {
  const { data } = await api.get(`/projects/${projectId}/public`);
  return data;
}

export async function getDashboardStats() {
  const { data } = await api.get('/dashboard/stats');
  return data;
}

export async function uploadProjectTemplate(projectId, file) {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post(`/projects/${projectId}/template`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}

export async function uploadProjectWorkbook(projectId, file) {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post(`/projects/${projectId}/workbook`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}

export async function getProjectTemplateAnalysis(projectId) {
  const { data } = await api.get(`/projects/${projectId}/template-analysis`);
  return data;
}

export async function getWorkbookAssets(projectId) {
  const { data } = await api.get(`/projects/${projectId}/workbook-assets`);
  return data;
}

export async function getProjectWorkbookAnalysis(projectId) {
  const { data } = await api.get(`/projects/${projectId}/workbook-analysis`);
  return data;
}

export async function syncProjectTemplateAssets(projectId) {
  const { data } = await api.post(`/projects/${projectId}/sync-template-assets`);
  return data;
}

export async function syncProjectWorkbookAssets(projectId) {
  const { data } = await api.post(`/projects/${projectId}/sync-workbook-assets`);
  return data;
}

// ─── Photo Captions from Template ───────────────────────────────────────────

export async function getProjectPhotoCaptions(projectId) {
  const { data } = await api.get(`/projects/${projectId}/photo-captions`);
  return data;
}

// ─── Project Checklist Templates ─────────────────────────────────────────────

export async function getProjectChecklistTemplate(projectId) {
  const { data } = await api.get(`/projects/${projectId}/checklist-template`);
  return data;
}

export async function updateProjectChecklistTemplate(projectId, templateData) {
  const { data } = await api.put(`/projects/${projectId}/checklist-template`, templateData);
  return data;
}

export async function resetProjectChecklistTemplate(projectId) {
  const { data } = await api.delete(`/projects/${projectId}/checklist-template`);
  return data;
}

// ─── Meter Draft Data (save/load report progress) ─────────────

export async function saveMeterDrafts(projectId, meterData) {
  const { data } = await api.post(`/projects/${projectId}/meter-drafts`, { meter_data: meterData });
  return data;
}

export async function loadMeterDrafts(projectId) {
  const { data } = await api.get(`/projects/${projectId}/meter-drafts`);
  return data;
}

// ─── Auto-generate Report Template with Sheets for All Meters ─────────────

export async function prepareReportTemplate(projectId) {
  const { data } = await api.post(`/projects/${projectId}/prepare-report-template`);
  return data;
}
