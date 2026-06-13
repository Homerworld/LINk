import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'https://link-production-49d3.up.railway.app/api'

const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('link_admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401) {
      localStorage.removeItem('link_admin_token')
      window.location.reload()
    }
    return Promise.reject(e)
  }
)

const ok = (r) => r.data?.data ?? r.data
const fail = (e) => { throw new Error(e.response?.data?.message || e.message || 'Error') }

export const adminApi = {
  login: (phone, password) => api.post('/auth/login', { phone, password }).then(ok).catch(fail),
  dashboard: () => api.get('/admin/dashboard').then(ok).catch(fail),
  kycQueue: (status = 'under_review') => api.get(`/admin/kyc?status=${status}`).then(ok).catch(fail),
  reviewKyc: (id, action, reason) => api.post(`/admin/kyc/${id}/review`, { action, reason }).then(ok).catch(fail),
  disputes: () => api.get('/admin/disputes').then(ok).catch(fail),
  ruleDispute: (id, body) => api.post(`/admin/disputes/${id}/rule`, body).then(ok).catch(fail),
  vendors: () => api.get('/admin/vendors').then(ok).catch(fail),
  vendorStatus: (id, action) => api.post(`/admin/vendors/${id}/status`, { action }).then(ok).catch(fail),
}

export default api
