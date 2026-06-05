import { AUTH_BASE_URL } from '@/utilities/serverUrls';

export interface ChatRegistrationStatus {
  authenticated: boolean;
  registered: boolean;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.error === 'string' && data.error) return data.error;
  } catch {
    // ignore parse errors
  }
  return fallback;
}

export async function getChatRegistrationStatus(): Promise<ChatRegistrationStatus> {
  const res = await fetch(`${AUTH_BASE_URL}/api/chat/status`, {
    credentials: 'include',
  });
  if (res.status === 401 || res.status === 403) {
    return { authenticated: false, registered: false };
  }
  if (!res.ok) throw new Error(await readError(res, 'Failed to load chat access status'));
  const data = await res.json();
  return {
    authenticated: data?.authenticated === true,
    registered: data?.registered === true,
  };
}
