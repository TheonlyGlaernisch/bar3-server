import { apiFetch } from '@/utilities/authFetch';

export default async function sendMessage(
  messageHTML: string,
  nationDetails: { nationName: string; nationID: string; leaderName: string }
) {
  let error;

  const response = await apiFetch(
    '/api/sendMessage',
    { method: 'POST' },
    {
      messageHTML,
      nationID: parseInt(nationDetails.nationID),
      nationName: nationDetails.nationName,
      leaderName: nationDetails.leaderName,
    }
  ).catch((e) => {
    error = e;
  });

  if (!response) return error;
  if (response.status !== 204) return new Error('Unexpected response code: ' + response.status);

  return true;
}


