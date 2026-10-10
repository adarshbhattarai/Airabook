import { apiService } from '@/services/ApiService';
import { SERVICE_ENDPOINTS } from '@/config/serviceEndpoints';

/** List PostgreSQL application users; the backend enforces SYSTEM_ADMIN access. */
export const getAdminUsers = async () => {
  const response = await apiService.get(SERVICE_ENDPOINTS.spring.paths.adminUsers);
  if (response?.status !== true || !Array.isArray(response.data)) {
    throw new Error('Invalid user directory response');
  }
  return response.data;
};
