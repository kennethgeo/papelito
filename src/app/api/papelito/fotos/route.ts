import { isDatabaseConfigured } from '@/lib/db/client';
import { logError } from '@/lib/observability/log';
import { readPersonalLinkPhoto } from '@/lib/repositories/personal-links';
import { wishPhotoContentType } from '@/lib/repositories/photos';

// Photo of a wish shown on a personal papelito. POST with the link's secret in
// the body (never in the URL, which request logs keep). Only wishes the link
// holder's current receiver shared in that exchange. Never cached.
const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };

export async function POST(request: Request) {
  try {
    if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return new Response(null, { status: 415, headers: privateHeaders });
    const text = await request.text();
    if (text.length > 512) return new Response(null, { status: 413, headers: privateHeaders });
    let body: { token?: unknown; wishId?: unknown };
    try { body = JSON.parse(text) as typeof body; } catch { return new Response(null, { status: 400, headers: privateHeaders }); }
    const image = isDatabaseConfigured() ? await readPersonalLinkPhoto(body?.token, body?.wishId) : null;
    return image
      ? new Response(new Uint8Array(image), { headers: { ...privateHeaders, 'Content-Type': wishPhotoContentType(image) } })
      : new Response(null, { status: 404, headers: privateHeaders });
  } catch (error) {
    logError('personal_link.photo_failed', error);
    return new Response(null, { status: 503, headers: { ...privateHeaders, 'Retry-After': '30' } });
  }
}
