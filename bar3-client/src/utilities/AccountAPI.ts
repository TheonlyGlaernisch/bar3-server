import axios from 'axios';
import { API_BASE_URL } from '@/utilities/serverUrls';

const ACCOUNT_API_BASE_URL = `${API_BASE_URL}/api`;

interface AccountData {
  apiKey: string;
  customMessage: string;
  createdAt: string;
}

export const accountApi = {
  async getAccount(apiKey: string): Promise<AccountData> {
    const response = await axios.get(`${ACCOUNT_API_BASE_URL}/account`, {
      headers: {
        'x-api-key': apiKey
      }
    });
    return response.data;
  },

  async updateMessage(
    apiKey: string,
    message: string
  ): Promise<{ success: boolean; customMessage: string }> {
    const response = await axios.post(
      `${ACCOUNT_API_BASE_URL}/account/message`,
      { message },
      {
        headers: {
          'x-api-key': apiKey
        }
      }
    );
    return response.data;
  },

  async createApiKey(): Promise<{ success: boolean; apiKey: string }> {
    const response = await axios.post(`${ACCOUNT_API_BASE_URL}/api-key/create`);
    return response.data;
  }
};
