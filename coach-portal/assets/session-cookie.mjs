/**
 * Sync Supabase browser session → HttpOnly cookie via /api/session.
 * Never logs tokens.
 */

export async function syncServerSessionCookie(session) {
  if (!session?.access_token || typeof fetch !== 'function') return false;
  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        access_token: session.access_token,
        expires_in: session.expires_in || 3600,
      }),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export async function clearServerSessionCookie() {
  if (typeof fetch !== 'function') return false;
  try {
    const res = await fetch('/api/session', {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}
