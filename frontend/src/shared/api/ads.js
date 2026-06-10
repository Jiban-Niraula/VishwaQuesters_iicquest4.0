import { http } from './http.js';

export const adsApi = {
  marketplace() {
    return http.get('/ads/marketplace').then((res) => res.data);
  },
  play(payload) {
    return http.post('/ads/play', payload).then((res) => res.data);
  },
  completePlacement(id, payload) {
    return http.put(`/ads/placement/${id}/complete`, payload).then((res) => res.data);
  },
  canUpload() {
    return http.get('/ads/can-upload').then((res) => res.data);
  },
  create(payload) {
    return http.post('/ads', payload).then((res) => res.data);
  },
  upload(formData) {
    return http.post('/ads/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((res) => res.data);
  },
  mine() {
    return http.get('/ads/my').then((res) => res.data);
  }
};
