import api from './api';

export async function getPanels(projectId) {
  const { data } = await api.get('/panels', {
    params: projectId ? { project_id: projectId } : undefined,
  });
  return data;
}

export async function createPanel(payload) {
  const { data } = await api.post('/panels', payload);
  return data;
}

export async function updatePanel(panelId, payload) {
  const { data } = await api.put(`/panels/${panelId}`, payload);
  return data;
}

export async function deletePanel(panelId) {
  const { data } = await api.delete(`/panels/${panelId}`);
  return data;
}

export async function getPublicPanel(panelId) {
  const { data } = await api.get(`/panels/${panelId}/public`);
  return data;
}

export async function getLoops(panelId) {
  const { data } = await api.get('/loops', {
    params: panelId ? { panel_id: panelId } : undefined,
  });
  return data;
}

export async function createLoop(payload) {
  const { data } = await api.post('/loops', payload);
  return data;
}

export async function updateLoop(loopId, payload) {
  const { data } = await api.put(`/loops/${loopId}`, payload);
  return data;
}

export async function deleteLoop(loopId) {
  const { data } = await api.delete(`/loops/${loopId}`);
  return data;
}

export async function getMeters(filters = {}) {
  const { data } = await api.get('/meters', {
    params: filters,
  });
  return data;
}

export async function getMeterDetail(meterId) {
  const { data } = await api.get(`/meters/${meterId}`);
  return data;
}

export async function createMeter(payload) {
  const { data } = await api.post('/meters', payload);
  return data;
}

export async function updateMeter(meterId, payload) {
  const { data } = await api.put(`/meters/${meterId}`, payload);
  return data;
}

export async function deleteMeter(meterId) {
  const { data } = await api.delete(`/meters/${meterId}`);
  return data;
}

export async function importAssets(projectId, file) {
  const formData = new FormData();
  formData.append('project_id', projectId);
  formData.append('file', file);

  const { data } = await api.post('/assets/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}

export async function syncAssetsFromTemplate(projectId) {
  const { data } = await api.post(`/projects/${projectId}/assets/sync-template`);
  return data;
}

export async function exportAssetsToExcel(projectId) {
  const { data } = await api.post(`/projects/${projectId}/assets/export-excel`);
  return data;
}

export async function uploadProjectPhoto(projectId, file) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post(`/projects/${projectId}/photos/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// Get assets directly from project workbook (Excel file)
export async function getWorkbookAssets(projectId) {
  const { data } = await api.get(`/projects/${projectId}/workbook-assets`);
  return data;
}
