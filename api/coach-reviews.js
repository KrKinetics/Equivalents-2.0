const MASTER_USER_ID = '143f2b15-5d24-4992-b648-42c43bd1e802';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 32_768) throw new Error('payload_too_large');
  }
  return body ? JSON.parse(body) : {};
}

module.exports = async function handler(req, res) {
  const { requireRequestAuth } = await import('../src/coach/server/require-request-auth.mjs');
  const { readAccessToken } = await import('../src/coach/security/portal-auth.mjs');
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const accessToken = readAccessToken({
    cookieHeader: req.headers.cookie || '',
    authorization: req.headers.authorization || '',
  });

  const auth = await requireRequestAuth({
    accessToken,
    requestedOrganizationSlug: 'kr-kinetics',
    allowedRoles: ['platform_owner'],
    supabaseUrl,
    publishableKey,
  });
  if (!auth.ok || auth.userId !== MASTER_USER_ID) {
    return send(res, auth.ok ? 403 : auth.status, { error: 'forbidden' });
  }

  const base = supabaseUrl.replace(/\/$/, '');
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (req.method === 'GET') {
    const url = `${base}/rest/v1/client_review_submissions?select=id,public_id,locale,first_name,last_initial,email,service,goal,rating,comment,status,featured,moderation_note,reviewed_at,published_at,created_at&order=created_at.desc`;
    const response = await fetch(url, { headers });
    if (!response.ok) return send(res, 502, { error: 'reviews_unavailable' });
    return send(res, 200, { reviews: await response.json() });
  }

  if (req.method === 'PATCH') {
    let input;
    try {
      input = await readBody(req);
    } catch {
      return send(res, 400, { error: 'invalid_payload' });
    }
    const id = typeof input.id === 'string' ? input.id : '';
    const status = ['pending', 'approved', 'rejected'].includes(input.status)
      ? input.status
      : null;
    if (!id || !status) return send(res, 400, { error: 'invalid_payload' });

    const patch = {
      status,
      featured: status === 'approved' && input.featured === true,
      moderation_note:
        typeof input.moderationNote === 'string'
          ? input.moderationNote.trim().slice(0, 1000) || null
          : null,
    };
    for (const [source, target, max] of [
      ['firstName', 'first_name', 60],
      ['lastInitial', 'last_initial', 2],
      ['goal', 'goal', 80],
      ['comment', 'comment', 1000],
    ]) {
      if (typeof input[source] === 'string') patch[target] = input[source].trim().slice(0, max);
    }
    if ([1, 2, 3, 4, 5].includes(Number(input.rating))) patch.rating = Number(input.rating);

    const response = await fetch(
      `${base}/rest/v1/client_review_submissions?id=eq.${encodeURIComponent(id)}&select=*`,
      {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      },
    );
    if (!response.ok) return send(res, 502, { error: 'review_update_failed' });
    const rows = await response.json();
    return send(res, 200, { ok: true, review: rows[0] || null });
  }

  res.setHeader('Allow', 'GET, PATCH');
  return send(res, 405, { error: 'method_not_allowed' });
};
