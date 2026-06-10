import { http } from './http.js';

export const eventsApi = {
  list() {
    return http.get('/events').then((res) => res.data);
  },
  create(payload) {
    return http.post('/events', payload).then((res) => res.data);
  },
  get(id) {
    return http.get(`/events/${id}`).then((res) => res.data);
  },
  getPublic(code) {
    return http.get(`/events/code/${code}`).then((res) => res.data);
  },
  update(id, payload) {
    return http.put(`/events/${id}`, payload).then((res) => res.data);
  },
  remove(id) {
    return http.delete(`/events/${id}`).then((res) => res.data);
  }
};
