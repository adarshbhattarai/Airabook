import { getSpringApiUrl } from '@/config/runtimeConfig';

const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) return '';
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
};

const springBaseUrl = normalizeBaseUrl(getSpringApiUrl());
const pageBaseUrl = springBaseUrl.endsWith('/api/v1/page')
  ? springBaseUrl
  : `${springBaseUrl}/api/v1/page`;

export class ApiUrlConstants {
  static BASE_URL = springBaseUrl;
  static PAGE_BASE_URL = pageBaseUrl;
  static SAVE_PAGE_BLOCKS = `${ApiUrlConstants.PAGE_BASE_URL}/save-page-blocks`;
  static REWRITE_PAGE_BLOCK = `${ApiUrlConstants.PAGE_BASE_URL}/rewrite-page-block`;
}
