'use server';
import { requireUser, safeAction } from './access';
import { PublicError } from './errors';
import { storeWishPhoto, deleteWishPhoto, normalizeWishImage } from '@/lib/repositories/photos';
import { publicFetch } from '@/lib/security/public-fetch';
import { dbQuery } from '@/lib/db/client';
export async function uploadWishPhotoAction(form: FormData) { return safeAction(async () => {
  const u = await requireUser(); const file = form.get('photo'), id = form.get('wishId');
  if (!(file instanceof File) || typeof id !== 'string' || file.size > 1024 * 1024) throw new PublicError('Elegí una foto de hasta 1 MB.');
  return storeWishPhoto(u.id, id, new Uint8Array(await file.arrayBuffer()));
}); }
export async function removeWishPhotoAction(id: string) { return safeAction(async () => deleteWishPhoto((await requireUser()).id, id)); }
function decode(value: string) { return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d{1,5});/g, (_, n) => String.fromCharCode(Number(n))).slice(0, 200); }
export async function linkPreviewAction(raw: string) { return safeAction(async () => {
  const u = await requireUser();
  const rate = await dbQuery("UPDATE profiles SET preview_checked_at = now() WHERE user_id = $1 AND (preview_checked_at IS NULL OR preview_checked_at < now() - interval '10 seconds') RETURNING user_id", [u.id]);
  if (!rate.rowCount) throw new PublicError('Esperá unos segundos antes de consultar otra referencia.');
  const page = await publicFetch(raw, 'html'); const html = page.bytes.toString('utf8');
  let title = html.match(/<title[^>]*>([^<]{1,500})<\/title>/i)?.[1] || '';
  let image = '';
  for (const tag of html.match(/<meta\s[^>]{1,3000}>/gi) || []) {
    const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
    if (key === 'og:title' && content) title = content;
    if (key === 'og:image' && content) image = content;
  }
  let imageData = '';
  if (image) { try { const fetched = await publicFetch(new URL(image.replace(/&amp;/g, '&'), page.url).href, 'image'); imageData = `data:image/jpeg;base64,${(await normalizeWishImage(fetched.bytes)).toString('base64')}`; } catch { /* Title remains useful if the image is unavailable. */ } }
  return { title: decode(title).trim().slice(0, 150), site: new URL(page.url).hostname, imageData };
}); }
