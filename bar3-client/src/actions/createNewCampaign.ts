import getCampaigns from './getAnalyticalCampaigns';
import { apiFetch } from '@/utilities/authFetch';

export default async function createNewCampaign(name: string) {
  let error;

  const response = await apiFetch(
    '/analytics/newCampaign',
    { method: 'POST' },
    { name }
  ).catch((e) => {
    error = e;
    console.error(e);
  });

  if (!response) return error;
  if (response.status !== 200) return new Error('Unexpected response code: ' + response.status);

  await getCampaigns();
}
