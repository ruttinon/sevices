import api from './api';

export async function loginAdmin(username) {
  const { data } = await api.post('/auth/login', {
    username,
    role: 'admin',
  });
  return data;
}
