import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API_URL =
  (Constants.expoConfig?.extra as any)?.apiUrl ||
  'https://link-production-49d3.up.railway.app/api';

const api = axios.create({ baseURL: API_URL, timeout: 20000 });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Unwrap { success, message, data } envelope; surface clean errors
const ok = (res: any) => res.data?.data ?? res.data;
const err = (e: any) => {
  const msg = e.response?.data?.message || e.message || 'Something went wrong';
  throw new Error(msg);
};

export const authAPI = {
  signupCustomer: (b: any) => api.post('/auth/signup/customer', b).then(ok).catch(err),
  signupVendor: (b: any) => api.post('/auth/signup/vendor', b).then(ok).catch(err),
  login: (phone: string, password: string) =>
    api.post('/auth/login', { phone, password }).then(ok).catch(err),
  me: () => api.get('/auth/me').then(ok).catch(err),
  setPin: (pin: string) => api.post('/auth/pin', { pin }).then(ok).catch(err),
};

export const searchAPI = {
  services: () => api.get('/search/services').then(ok).catch(err),
  autocomplete: (q: string) => api.get(`/search/autocomplete?q=${encodeURIComponent(q)}`).then(ok).catch(err),
  vendors: (params: any) => api.get('/search/vendors', { params }).then(ok).catch(err),
  vendor: (id: string) => api.get(`/search/vendor/${id}`).then(ok).catch(err),
};

export const offerAPI = {
  create: (b: any) => api.post('/offers', b).then(ok).catch(err),
  mine: (status?: string) => api.get('/offers/mine', { params: { status } }).then(ok).catch(err),
  get: (id: string) => api.get(`/offers/${id}`).then(ok).catch(err),
  respond: (id: string, b: any) => api.post(`/offers/${id}/respond`, b).then(ok).catch(err),
};

export const paymentAPI = {
  initiate: (offerId: string) => api.post('/payments/initiate', { offerId }).then(ok).catch(err),
  devConfirm: (reference: string) => api.post(`/payments/dev-confirm/${reference}`).then(ok).catch(err),
  verify: (reference: string) => api.get(`/payments/verify/${reference}`).then(ok).catch(err),
  banks: () => api.get('/payments/banks').then(ok).catch(err),
};

export const jobAPI = {
  mine: (status?: string) => api.get('/jobs', { params: { status } }).then(ok).catch(err),
  get: (id: string) => api.get(`/jobs/${id}`).then(ok).catch(err),
  complete: (id: string) => api.post(`/jobs/${id}/complete`).then(ok).catch(err),
  confirm: (id: string) => api.post(`/jobs/${id}/confirm`).then(ok).catch(err),
  dispute: (id: string, b: any) => api.post(`/jobs/${id}/dispute`, b).then(ok).catch(err),
  review: (id: string, b: any) => api.post(`/jobs/${id}/review`, b).then(ok).catch(err),
};

export const walletAPI = {
  get: () => api.get('/wallet').then(ok).catch(err),
  transactions: () => api.get('/wallet/transactions').then(ok).catch(err),
  withdraw: (amount: number, pin: string, idempotencyKey?: string) =>
    api.post('/wallet/withdraw', { amount, pin, idempotencyKey }).then(ok).catch(err),
};

export const kycAPI = {
  status: () => api.get('/kyc/status').then(ok).catch(err),
  identity: (b: any) => api.post('/kyc/identity', b).then(ok).catch(err),
  services: (services: string[]) => api.post('/kyc/services', { services }).then(ok).catch(err),
  location: (b: any) => api.post('/kyc/location', b).then(ok).catch(err),
  submit: () => api.post('/kyc/submit').then(ok).catch(err),
};

export { API_URL };
export default api;
