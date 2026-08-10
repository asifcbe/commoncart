import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cc_customer_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const isAuthRoute = error.config?.url?.includes('/customers/login') ||
                        error.config?.url?.includes('/customers/register');
    if (error.response?.status === 401 && !isAuthRoute) {
      localStorage.removeItem('cc_customer_token');
      localStorage.removeItem('cc_customer');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
