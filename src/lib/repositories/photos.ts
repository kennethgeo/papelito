import 'server-only';
import sharp from 'sharp';
import { dbQuery, dbTransaction } from '@/lib/db/client';
import { PublicError } from '@/lib/data/errors';
export async function normalizeWishImage(bytes: Uint8Array) {
  if (bytes.byteLength > 1024 * 1024) throw new PublicError('La imagen debe pesar como máximo 1 MB antes de procesarla.');
  const data = Buffer.from(bytes);
  const raster = (data[0] === 0xff && data[1] === 0xd8) || data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || (data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP');
  if (!raster) throw new PublicError('Usá una imagen JPG, PNG o WebP.');
  try {
    const photo = await sharp(data, { limitInputPixels: 20_000_000, animated: false }).rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 70 }).toBuffer();
    if (photo.byteLength > 131072) throw new PublicError('Esta imagen tiene demasiado detalle. Elegí una más pequeña.');
    return photo;
  } catch (e) { if (e instanceof PublicError) throw e; throw new PublicError('No pudimos leer esta imagen. Probá con otra foto.'); }
}
export async function storeWishPhoto(userId: string, wishId: string, image: Uint8Array) {
  const normalized = await normalizeWishImage(image);
  return dbTransaction(async client => {
    await client.query("SELECT name FROM app_locks WHERE name = 'wish-photos' FOR UPDATE");
    const owned = await client.query(`SELECT w.id FROM wishes w JOIN profiles p ON p.user_id = w.user_id WHERE w.id = $1 AND (w.user_id = $2 OR p.guardian_user_id = $2)`, [wishId, userId]);
    if (!owned.rowCount) throw new PublicError('Este deseo no pertenece a tu cuenta.');
    const quota = await client.query<{ total: string; mine: string; current_size: string }>(`SELECT COALESCE(sum(octet_length(f.image)),0)::text AS total,
      count(*) FILTER (WHERE w.user_id = $1 OR p.guardian_user_id = $1)::text AS mine,
      COALESCE(max(octet_length(f.image)) FILTER (WHERE f.wish_id = $2),0)::text AS current_size
      FROM wish_photos f JOIN wishes w ON w.id = f.wish_id JOIN profiles p ON p.user_id = w.user_id`, [userId, wishId]);
    const q = quota.rows[0];
    if (Number(q.total) - Number(q.current_size) + normalized.byteLength > 25 * 1024 * 1024 || (Number(q.mine) >= 20 && !Number(q.current_size))) throw new PublicError('Se alcanzó la cuota de fotos del piloto. Quitá una foto antes de agregar otra.');
    await client.query('INSERT INTO wish_photos (wish_id, image) VALUES ($1, $2) ON CONFLICT (wish_id) DO UPDATE SET image = EXCLUDED.image, updated_at = now()', [wishId, normalized]);
    return true;
  });
}
export async function deleteWishPhoto(userId: string, wishId: string) {
  await dbQuery(`DELETE FROM wish_photos f USING wishes w, profiles p WHERE f.wish_id = w.id AND p.user_id = w.user_id AND w.id = $1 AND (w.user_id = $2 OR p.guardian_user_id = $2)`, [wishId, userId]);
  return true;
}
export async function readWishPhoto(userId: string, wishId: string) {
  const result = await dbQuery<{ image: Uint8Array }>(`SELECT f.image FROM wish_photos f JOIN wishes w ON w.id = f.wish_id JOIN profiles p ON p.user_id = w.user_id
    WHERE w.id = $1 AND (w.user_id = $2 OR p.guardian_user_id = $2 OR EXISTS (
      SELECT 1 FROM wish_selections ws JOIN exchanges e ON e.id = ws.exchange_id AND e.status = 'sorteado'
      JOIN draw_versions dv ON dv.exchange_id = e.id AND dv.version_number = e.current_draw_version
      JOIN assignments a ON a.draw_version_id = dv.id AND a.receiver_id = w.user_id AND a.giver_id = $2
      JOIN memberships mg ON mg.exchange_id = e.id AND mg.user_id = a.giver_id AND mg.status = 'approved'
      JOIN memberships mr ON mr.exchange_id = e.id AND mr.user_id = a.receiver_id AND mr.status = 'approved'
      WHERE ws.wish_id = w.id AND ws.user_id = w.user_id))`, [wishId, userId]);
  return result.rows[0]?.image || null;
}
