import { http } from './http.js';

export const destinationsApi = {
  list(eventId) {
    return http.get('/destinations', { params: { event_id: eventId } }).then((res) => res.data);
  },
  create(payload) {
    return http.post('/destinations', payload).then((res) => res.data);
  },
  update(id, payload) {
    return http.put(`/destinations/${id}`, payload).then((res) => res.data);
  },
  remove(id) {
    return http.delete(`/destinations/${id}`).then((res) => res.data);
  },
  start(destinationId) {
    return http.post('/stream/start', { destination_id: destinationId }).then((res) => res.data);
  },
  stop(destinationId) {
    return http.post('/stream/stop', { destination_id: destinationId }).then((res) => res.data);
  }
};
