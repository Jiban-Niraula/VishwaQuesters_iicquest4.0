import axios from 'axios';
import { config } from '../../app/config.js';
import { authStorage } from '../utils/storage.js';

export const http = axios.create({
  baseURL: config.apiUrl,
  timeout: 30000
});

http.interceptors.request.use((request) => {
  const token = authStorage.getToken();
  if (token) request.headers.Authorization = `Bearer ${token}`;
  return request;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      authStorage.clearAll();
    }
    const message = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Request failed';
    error.userMessage = message;
    return Promise.reject(error);
  }
);

export function apiError(error) {
  return error?.userMessage || error?.message || 'Something went wrong';
}
