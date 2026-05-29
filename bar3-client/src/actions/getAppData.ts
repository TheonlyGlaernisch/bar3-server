import { Message } from '../types';
import { apiFetch } from '@/utilities/authFetch';

export interface AppData {
  applicationOn: boolean;
  isSetup: boolean;
  sentMessages: Message[];
  apiDetails: {
    used: number;
    max: number;
  };
  serverVersion: string;
}

export default async function getAppData(): Promise<AppData | null> {
  const response = await apiFetch('/api/appData').catch(() => undefined);

  if (!response) return null;
  if (response.status !== 200) return null;

  const data: AppData | undefined = await response.json().catch(() => undefined);

  if (!data) return null;

  return data;
}
