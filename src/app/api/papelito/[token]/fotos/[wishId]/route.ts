import { logError } from '@/lib/observability/log';
import { readPersonalLinkPhoto } from '@/lib/repositories/personal-links';
import { wishPhotoContentType } from '@/lib/repositories/photos';

// Photo of a wish shown on a personal link: only the current receiver's
// wishes, and only while the link works. Never cached.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; wishId: string }> }) {
  const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  try {
    const { token, wishId } = await params;
    const image = await readPersonalLinkPhoto(token, wishId);
    return image
      ? new Response(new Uint8Array(image), { headers: { ...privateHeaders, 'Content-Type': wishPhotoContentType(image) } })
      : new Response(null, { status: 404, headers: privateHeaders });
  } catch (error) {
    logError('personal_link.photo_failed', error);
    return new Response(null, { status: 503, headers: { ...privateHeaders, 'Retry-After': '30' } });
  }
}
