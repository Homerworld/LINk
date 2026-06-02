import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api'

const api = axios.create({ baseURL: API_URL, timeout: 15000 })

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  async (err) => {
    if (err.response?.status === 401) {
      await SecureStore.deleteItemAsync('accessToken')
      await SecureStore.deleteItemAsync('refreshToken')
    }
    return Promise.reject(err)
  }
)

// Auth
export const authAPI = {
  sendOtp: (phone: string, purpose = 'signup') => api.post('/auth/otp/send', { phone, purpose }),
  verifyOtp: (phone: string, code: string, purpose = 'signup') => api.post('/auth/otp/verify', { phone, code, purpose }),
  customerSignup: (data: any) => api.post('/auth/signup/customer', data),
  vendorSignup: (data: any) => api.post('/auth/signup/vendor', data),
  login: (phone: string, password: string) => api.post('/auth/login', { phone, password }),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  setPin: (pin: string) => api.post('/auth/pin', { pin }),
  updatePushToken: (token: string) => api.post('/auth/push-token', { token }),
  getMe: () => api.get('/auth/me'),
}

// Search
export const searchAPI = {
  autocomplete: (q: string) => api.get(`/search/autocomplete?q=${q}`),
  searchVendors: (params: any) => api.get('/search/vendors', { params }),
  getVendor: (id: string) => api.get(`/search/vendor/${id}`),
  getServices: () => api.get('/search/services'),
}

// Offers
export const offersAPI = {
  create: (data: any) => api.post('/offers', data),
  respond: (id: string, data: any) => api.post(`/offers/${id}/respond`, data),
  getMine: (status?: string) => api.get('/offers/mine', { params: { status } }),
  get: (id: string) => api.get(`/offers/${id}`),
}

// Payments
export const paymentsAPI = {
  initiate: (offer_id: string) => api.post('/payments/initiate', { offer_id }),
  verify: (reference: string) => api.get(`/payments/verify/${reference}`),
  getBanks: () => api.get('/payments/banks'),
  devConfirm: (reference: string) => api.post(`/payments/dev-confirm/${reference}`),
}

// Jobs
export const jobsAPI = {
  getMine: (params?: any) => api.get('/jobs', { params }),
  get: (id: string) => api.get(`/jobs/${id}`),
  markComplete: (id: string) => api.post(`/jobs/${id}/complete`),
  confirm: (id: string) => api.post(`/jobs/${id}/confirm`),
  dispute: (id: string, data: any) => api.post(`/jobs/${id}/dispute`, data),
  review: (id: string, data: any) => api.post(`/jobs/${id}/review`, data),
}

// Wallet
export const walletAPI = {
  get: () => api.get('/wallet'),
  getTransactions: () => api.get('/wallet/transactions'),
  withdraw: (amount: number, pin: string) => api.post('/wallet/withdraw', { amount, pin }),
}

// KYC
export const kycAPI = {
  getStatus: () => api.get('/kyc/status'),
  submitIdentity: (data: any) => api.post('/kyc/identity', data),
  uploadIdDocument: (formData: FormData) => api.post('/kyc/id-document', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadSelfie: (formData: FormData) => api.post('/kyc/selfie', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  addServices: (service_ids: string[]) => api.post('/kyc/services', { service_ids }),
  uploadPortfolio: (formData: FormData) => api.post('/kyc/portfolio', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateLocation: (data: any) => api.post('/kyc/location', data),
  submit: () => api.post('/kyc/submit'),
}

export default api
