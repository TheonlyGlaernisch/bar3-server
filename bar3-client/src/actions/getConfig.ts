import { Config } from '../types';
import { apiFetch } from '@/utilities/authFetch';

export default async function getConfig() {
  let error;

  const response = await apiFetch('/api/config').catch((e) => {
    error = e;
  });

  if (!response) return error;
  if (response.status !== 200) return new Error('Unexpected response code: ' + response.status);

  const config: Config | undefined = await response.json().catch(() => {
    return undefined;
  });

  if (!config) return false;
  return config;
}
