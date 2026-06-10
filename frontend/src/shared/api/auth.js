import { http } from './http.js';

export const authApi = {
  login(payload) {
    return http.post('/login', payload).then((res) => res.data);
  },
  register(payload) {
    return http.post('/register', payload).then((res) => res.data);
  },
  me() {
    return http.get('/me').then((res) => res.data);
  }
};
