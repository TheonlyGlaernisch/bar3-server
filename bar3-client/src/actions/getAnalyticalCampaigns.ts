import { AnalyticalCampaign } from '@/interfaces/analytics';
import store from '@/store';
import { apiFetch } from '@/utilities/authFetch';

export default async function getCampaigns() {
  let error;

  const response = await apiFetch('/analytics/campaigns').catch((e) => {
    error = e;
    console.error(e);
  });

  if (!response) return error;
  if (response.status !== 200) return new Error('Unexpected response code: ' + response.status);

  const campaigns: AnalyticalCampaign[] = await response.json();
  store.commit('analytics/setCampaigns', campaigns);
}
