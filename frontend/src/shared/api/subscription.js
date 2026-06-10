import { http } from './http.js';

export const subscriptionApi = {
  get() {
    return http.get('/subscription').then((res) => res.data);
  },
  upgrade() {
    return http.post('/subscription/upgrade').then((res) => res.data);
  }
};
