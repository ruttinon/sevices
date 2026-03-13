import api from './api';

export async function getReports(filters = {}) {
  const { data } = await api.get('/reports', { params: filters });
  return data;
}

export async function getReportFile(reportId) {
  const { data } = await api.get(`/reports/${reportId}/download`, {
    responseType: 'blob',
  });
  return data;
}

export async function getAssetReportPreview(entityType, entityId) {
  const { data } = await api.get(`/reports/preview/${entityType}/${entityId}`, {
    responseType: 'blob',
  });
  return data;
}

export async function getReportMetadata(reportId) {
  const { data } = await api.get(`/reports/${reportId}/meta`);
  return data; // { last_modified: "..." }
}

export async function getReportDraft(serviceId) {
  const { data } = await api.get(`/service/${serviceId}/report-draft`);
  return data;
}

export async function updateReportDraft(serviceId, payload) {
  const { data } = await api.put(`/service/${serviceId}/report-draft`, payload);
  return data;
}

export async function generateReports(serviceId) {
  const { data } = await api.post(`/reports/generate/${serviceId}`);
  return data;
}

export async function generateReportByLoop(payload) {
  const { data } = await api.post('/reports/generate-by-loop', payload);
  return data;
}

export async function uploadPhotos(serviceId, uploadItems) {
  const formData = new FormData();
  formData.append('service_id', serviceId);
  uploadItems.forEach(({ file, caption, title }) => {
    formData.append('files', file);
    formData.append('captions', caption || '');
    formData.append('titles', title || '');  // New: photo titles
  });

  const { data } = await api.post('/upload/photo', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}

// New: Get checklist templates for different job types
export async function getChecklistTemplates(jobType = null) {
  const { data } = await api.get('/reports/checklist-templates', {
    params: jobType ? { job_type: jobType } : {},
  });
  return data;
}

// New: Create custom checklist template
export async function createCustomChecklistTemplate(template) {
  const { data } = await api.post('/reports/checklist-templates/custom', template);
  return data;
}

// New: Get report data by date for append mode
export async function getReportByDate(dateStr, projectId = null) {
  const { data } = await api.get(`/reports/by-date/${dateStr}`, {
    params: projectId ? { project_id: projectId } : {},
  });
  return data; // { exists: bool, data: {...}, file_path: "..." }
}
