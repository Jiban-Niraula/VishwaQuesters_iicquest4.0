import { http } from './http.js';

export const adminApi = {
  users(role) {
    return http.get('/admin/users', { params: role ? { role } : {} }).then((res) => res.data);
  },
  ads(status) {
    return http.get('/admin/ads', { params: status ? { status } : {} }).then((res) => res.data);
  },
  updateAdStatus(id, status, reason = '') {
    return http.put(`/admin/ads/${id}/status`, { status, reason }).then((res) => res.data);
  },
  revenue() {
    return http.get('/admin/revenue').then((res) => res.data);
  },
  settings() {
    return http.get('/admin/settings').then((res) => res.data);
  },
  updateSettings(payload) {
    return http.put('/admin/settings', payload).then((res) => res.data);
  },
  deposit(payload) {
    return http.post('/admin/deposit', payload).then((res) => res.data);
  },
  transactions() {
    return http.get('/admin/transactions').then((res) => res.data);
  }
};
