import { apiService } from '@/services/ApiService';
import { SERVICE_ENDPOINTS } from '@/config/serviceEndpoints';

/** Retrieve the selected workspace's existing key without generating one. */
export const getEnterpriseApiKey = async (accountId) => {
  const response = await apiService.get(
    `${SERVICE_ENDPOINTS.spring.paths.enterpriseApiKey}?accountId=${encodeURIComponent(accountId)}`
  );
  const details = response?.data;
  if (response?.status !== true || String(details?.accountId) !== String(accountId)
      || typeof details?.apiKey !== 'string' || !details.apiKey.trim()) {
    throw new Error('Unable to read the API key for this workspace.');
  }
  return details;
};
