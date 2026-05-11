import { Config } from '../types';
import { apiFetch } from '@/utilities/authFetch';

export default async function sendConfig(config: Config) {
  let error;

  const response = await apiFetch(
    '/api/setConfig',
    { method: 'POST' },
    { config }
  ).catch((e) => {
    error = e;
  });

  if (!response) return error;
  if (response.status !== 204) return new Error('Unexpected response code: ' + response.status);

  return true;
}
