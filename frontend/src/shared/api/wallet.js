import { http } from './http.js';

export const walletApi = {
  balance() {
    return http.get('/wallet/balance').then((res) => res.data);
  },
  transactions() {
    return http.get('/wallet/transactions').then((res) => res.data);
  }
};
