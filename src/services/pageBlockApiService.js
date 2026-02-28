import { apiService } from '@/services/ApiService';
import { ApiUrlConstants } from '@/constants/apiUrls';

const parseResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
};

const postPageBlockRequest = async (url, payload) => {
  const token = await apiService.getAuthToken();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const data = await parseResponse(response);
  if (!response.ok) {
    const message = data?.message || data?.error || (typeof data === 'string' ? data : 'Request failed');
    const error = new Error(message);
    error.status = response.status;
    error.response = data;
    throw error;
  }

  if (data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'status') && data.status === false) {
    const message = data?.message || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.response = data;
    throw error;
  }

  return data;
};

export const pageBlockApiService = {
  savePageBlocks(payload) {
    return postPageBlockRequest(ApiUrlConstants.SAVE_PAGE_BLOCKS, payload);
  },
  rewritePageBlock(payload) {
    return postPageBlockRequest(ApiUrlConstants.REWRITE_PAGE_BLOCK, payload);
  },
};
