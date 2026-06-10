export const config = {
  appName: import.meta.env.VITE_APP_NAME || 'Vision Cast',

  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8080/api',
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws',
  streamWsUrl:
    import.meta.env.VITE_STREAM_WS_URL || 'ws://localhost:8080/api/stream/ws',

  uploadBase:
    import.meta.env.VITE_PUBLIC_UPLOAD_BASE || 'http://localhost:8080',

  esewaSuccessUrl:
    import.meta.env.VITE_ESEWA_SUCCESS_URL ||
    'http://localhost:5173/payment/esewa/success',

  esewaFailureUrl:
    import.meta.env.VITE_ESEWA_FAILURE_URL ||
    'http://localhost:5173/payment/esewa/failure',
};