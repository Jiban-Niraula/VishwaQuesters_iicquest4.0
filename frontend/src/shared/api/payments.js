import { http } from './http.js';

export const paymentsApi = {
  initiateEsewa(payload) {
    return http.post('/payments/esewa/initiate', payload).then((res) => res.data);
  },
  verifyEsewa(params) {
    return http.get('/payments/esewa/verify', { params }).then((res) => res.data);
  },
  status(paymentRef) {
    return http.get(`/payments/${paymentRef}/status`).then((res) => res.data);
  }
};
