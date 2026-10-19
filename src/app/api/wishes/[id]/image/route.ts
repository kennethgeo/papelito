import { requireUser } from '@/lib/data/access';
import { readWishPhoto } from '@/lib/repositories/photos';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
  try { const user = await requireUser(); const id = (await params).id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404, headers: privateHeaders });
    const image = await readWishPhoto(user.id, id);
    return image ? new Response(new Uint8Array(image), { headers: { ...privateHeaders, 'Content-Type': 'image/jpeg' } }) : new Response(null, { status: 404, headers: privateHeaders });
  } catch { return new Response(null, { status: 401, headers: privateHeaders }); }
}
