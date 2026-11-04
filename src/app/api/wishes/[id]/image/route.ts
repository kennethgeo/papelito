import { requireUser, PublicError } from '@/lib/data/access';
import { SessionUnavailableError } from '@/lib/auth/server';
import { logError } from '@/lib/observability/log';
import { readWishPhoto, wishPhotoContentType } from '@/lib/repositories/photos';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
  try { const user = await requireUser(); const id = (await params).id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404, headers: privateHeaders });
    const image = await readWishPhoto(user.id, id);
    return image ? new Response(new Uint8Array(image), { headers: { ...privateHeaders, 'Content-Type': wishPhotoContentType(image) } }) : new Response(null, { status: 404, headers: privateHeaders });
  } catch (error) {
    // Unknown session state is not "signed out"; other failures are logged.
    if (error instanceof SessionUnavailableError) return new Response(null, { status: 503, headers: { ...privateHeaders, 'Retry-After': '30' } });
    if (error instanceof PublicError) return new Response(null, { status: 401, headers: privateHeaders });
    logError('wish_photo.read_failed', error);
    return new Response(null, { status: 500, headers: privateHeaders });
  }
}
