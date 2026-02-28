import { auth } from '@/lib/firebase';

/**
 * API Service for making HTTP requests to backend services
 * Handles environment-based URL configuration and JWT authentication
 */
class ApiService {
    constructor() {
        this.baseURL = this.getBaseURL();
        this.defaultHeaders = {
            'Content-Type': 'application/json',
        };
    }

    /**
     * Get the base URL based on current environment
     * @returns {string} Base URL for API requests
     */
    getBaseURL() {
        const backendUrl = import.meta.env.VITE_BACKEND_API_URL;
        console.log('VITE_BACKEND_API_URL:', backendUrl);
        if (!backendUrl) {
            console.warn('⚠️ VITE_BACKEND_API_URL not configured, using default localhost');
            return 'http://localhost:8000';
        }

        console.log('🌐 API Service initialized with URL:', backendUrl);
        return backendUrl;
    }

    /**
     * Get JWT token from Firebase Auth
     * @param {boolean} forceRefresh - Force token refresh
     * @returns {Promise<string|null>} JWT token or null if not authenticated
     */
    async getAuthToken(forceRefresh = false) {
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) {
                console.warn('⚠️ No authenticated user found');
                return null;
            }

            const token = await currentUser.getIdToken(forceRefresh);
            return token;
        } catch (error) {
            console.error('❌ Error getting auth token:', error);
            return null;
        }
    }

    /**
     * Build headers for the request
     * @param {object} customHeaders - Additional headers to include
     * @param {boolean} includeAuth - Whether to include Authorization header
     * @returns {Promise<object>} Headers object
     */
    async buildHeaders(customHeaders = {}, includeAuth = true) {
        const headers = { ...this.defaultHeaders, ...customHeaders };

        if (includeAuth) {
            const token = await this.getAuthToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        }

        return headers;
    }

    /**
     * Build full URL for the request
     * @param {string} endpoint - API endpoint (e.g., '/users', '/books/123')
     * @returns {string} Full URL
     */
    buildURL(endpoint) {
        // Remove leading slash if present to avoid double slashes
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
        return `${this.baseURL}/${cleanEndpoint}`;
    }

    /**
     * Handle API response
     * @param {Response} response - Fetch response object
     * @returns {Promise<any>} Parsed response data
     * @throws {Error} If response is not ok
     */
    async handleResponse(response) {
        const contentType = response.headers.get('content-type');

        // Parse response body
        let data;
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        if (!response.ok) {
            // Extract error message from response
            const errorMessage = data?.error || data?.message || data || `HTTP ${response.status}: ${response.statusText}`;
            const error = new Error(errorMessage);
            error.status = response.status;
            error.response = data;
            throw error;
        }

        return data;
    }

    /**
     * Generic request method
     * @param {string} endpoint - API endpoint
     * @param {object} options - Request options
     * @param {string} options.method - HTTP method
     * @param {object} options.body - Request body (will be stringified)
     * @param {object} options.headers - Additional headers
     * @param {boolean} options.includeAuth - Include Authorization header (default: true)
     * @returns {Promise<any>} Response data
     */
    async request(endpoint, { method = 'GET', body = null, headers = {}, includeAuth = true } = {}) {
        try {
            const url = this.buildURL(endpoint);
            const requestHeaders = await this.buildHeaders(headers, includeAuth);

            const config = {
                method,
                headers: requestHeaders,
            };

            if (body && method !== 'GET' && method !== 'HEAD') {
                config.body = JSON.stringify(body);
            }

            console.log(`🔄 API ${method} request to:`, url);

            const response = await fetch(url, config);
            const data = await this.handleResponse(response);

            console.log(`✅ API ${method} request successful:`, url);
            return data;
        } catch (error) {
            console.error(`❌ API ${method} request failed:`, endpoint, error);
            throw error;
        }
    }

    /**
     * GET request
     * @param {string} endpoint - API endpoint
     * @param {object} options - Additional options
     * @returns {Promise<any>} Response data
     */
    async get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' });
    }

    /**
     * POST request
     * @param {string} endpoint - API endpoint
     * @param {object} body - Request body
     * @param {object} options - Additional options
     * @returns {Promise<any>} Response data
     */
    async post(endpoint, body, options = {}) {
        return this.request(endpoint, { ...options, method: 'POST', body });
    }

    /**
     * PUT request
     * @param {string} endpoint - API endpoint
     * @param {object} body - Request body
     * @param {object} options - Additional options
     * @returns {Promise<any>} Response data
     */
    async put(endpoint, body, options = {}) {
        return this.request(endpoint, { ...options, method: 'PUT', body });
    }

    /**
     * PATCH request
     * @param {string} endpoint - API endpoint
     * @param {object} body - Request body
     * @param {object} options - Additional options
     * @returns {Promise<any>} Response data
     */
    async patch(endpoint, body, options = {}) {
        return this.request(endpoint, { ...options, method: 'PATCH', body });
    }

    /**
     * DELETE request
     * @param {string} endpoint - API endpoint
     * @param {object} options - Additional options
     * @returns {Promise<any>} Response data
     */
    async delete(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'DELETE' });
    }

    /**
     * Upload file with multipart/form-data
     * @param {string} endpoint - API endpoint
     * @param {FormData} formData - FormData object with files
     * @param {object} options - Additional options
     * @returns {Promise<any>} Response data
     */
    async upload(endpoint, formData, options = {}) {
        try {
            const url = this.buildURL(endpoint);
            const token = await this.getAuthToken();

            const headers = {
                ...options.headers,
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            // Don't set Content-Type for FormData - browser will set it with boundary
            const config = {
                method: 'POST',
                headers,
                body: formData,
            };

            console.log(`📤 Uploading to:`, url);

            const response = await fetch(url, config);
            const data = await this.handleResponse(response);

            console.log(`✅ Upload successful:`, url);
            return data;
        } catch (error) {
            console.error(`❌ Upload failed:`, endpoint, error);
            throw error;
        }
    }

    /**
     * Search for users by email or display name
     * @param {string} searchTerm - The search query
     * @returns {Promise<object>} List of matching users
     */
    async searchUsers(searchTerm) {
        if (!searchTerm || searchTerm.length < 3) {
            return { results: [] };
        }
        return this.get(`api/v1/users/search?q=${encodeURIComponent(searchTerm)}`);
    }
}

// Singleton instance
export const apiService = new ApiService();
