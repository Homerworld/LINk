import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh token on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        const { accessToken } = res.data.data;
        await SecureStore.setItemAsync('accessToken', accessToken);
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        await SecureStore.deleteItemAsync('accessToken');
        await SecureStore.deleteItemAsync('refreshToken');
        // Redirect to login handled by auth state listener
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ── Auth ──────────────────────────────────────────────────────────
export const authAPI = {
  sendOtp: (phone: string, purpose: string) => api.post('/auth/otp/send', { phone, purpose }),
  verifyOtp: (phone: string, code: string, purpose: string) => api.post('/auth/otp/verify', { phone, code, purpose }),
  customerSignup: (data: any) => api.post('/auth/signup/customer', data),
  vendorSignup: (data: any) => api.post('/auth/signup/vendor', data),
  login: (phone: string, password: string) => api.post('/auth/login', { phone, password }),
  setPin: (pin: string, confirm_pin: string) => api.post('/auth/pin', { pin, confirm_pin }),
  updatePushToken: (token: string) => api.post('/auth/push-token', { expo_push_token: token }),
};

// ── KYC ───────────────────────────────────────────────────────────
export const kycAPI = {
  submitIdentity: (data: any) => api.post('/kyc/identity', data),
  uploadIdDocument: (formData: FormData) => api.post('/kyc/id-document', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadSelfie: (formData: FormData) => api.post('/kyc/selfie', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  addServices: (service_ids: string[]) => api.post('/kyc/services', { service_ids }),
  uploadPortfolio: (formData: FormData) => api.post('/kyc/portfolio', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateLocation: (data: any) => api.post('/kyc/location', data),
  submit: () => api.post('/kyc/submit'),
  getStatus: () => api.get('/kyc/status'),
  suggestService: (name: string) => api.post('/kyc/suggest-service', { name }),
};

// ── Search ────────────────────────────────────────────────────────
export const searchAPI = {
  autocomplete: (q: string) => api.get(`/search/autocomplete?q=${encodeURIComponent(q)}`),
  searchVendors: (params: any) => api.get('/search/vendors', { params }),
  getVendorProfile: (vendorId: string, lat?: number, lng?: number) =>
    api.get(`/search/vendor/${vendorId}`, { params: lat && lng ? { lat, lng } : {} }),
  getServices: () => api.get('/search/services'),
};

// ── Offers ────────────────────────────────────────────────────────
export const offersAPI = {
  createOffer: (data: any) => api.post('/offers', data),
  respondToOffer: (offerId: string, action: string, data?: any) => api.post(`/offers/${offerId}/respond`, { action, ...data }),
  acceptCounter: (offerId: string) => api.post(`/offers/${offerId}/accept`),
  getVendorOffers: () => api.get('/offers/mine'),
  getNegotiationThread: (jobId: string) => api.get(`/offers/job/${jobId}`),
};

// ── Payments ──────────────────────────────────────────────────────
export const paymentsAPI = {
  initiate: (job_id: string, method: string) => api.post('/payments/initiate', { job_id, method }),
  verify: (reference: string) => api.get(`/payments/verify/${reference}`),
  getBanks: () => api.get('/payments/banks'),
};

// ── Jobs ──────────────────────────────────────────────────────────
export const jobsAPI = {
  getMyJobs: (params?: any) => api.get('/jobs', { params }),
  getJob: (jobId: string) => api.get(`/jobs/${jobId}`),
  markComplete: (jobId: string) => api.post(`/jobs/${jobId}/complete`),
  confirmComplete: (jobId: string) => api.post(`/jobs/${jobId}/confirm`),
  submitReview: (data: any) => api.post('/jobs/review', data),
};

// ── Wallet ────────────────────────────────────────────────────────
export const walletAPI = {
  getWallet: () => api.get('/wallet'),
  withdraw: (amount: number, pin: string) => api.post('/wallet/withdraw', { amount, pin }),
  getTransactions: (page?: number) => api.get('/wallet/transactions', { params: { page } }),
};

// ── Disputes ──────────────────────────────────────────────────────
export const disputesAPI = {
  raise: (job_id: string, issue: string) => api.post('/disputes', { job_id, issue }),
  submitEvidence: (disputeId: string, formData: FormData) =>
    api.post(`/disputes/${disputeId}/evidence`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getDispute: (disputeId: string) => api.get(`/disputes/${disputeId}`),
};

// ── Notifications ─────────────────────────────────────────────────
export const notificationsAPI = {
  get: (page?: number) => api.get('/notifications', { params: { page } }),
  markRead: (ids?: string[]) => api.post('/notifications/read', { notification_ids: ids }),
};
