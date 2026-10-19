import 'server-only';
import dns from 'node:dns/promises';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { PublicError } from '@/lib/data/errors';
const blocked = new BlockList();
for (const [ip, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(ip, prefix, 'ipv4');
blocked.addSubnet('192.88.99.0', 24, 'ipv4');
for (const [ip, prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as const) blocked.addSubnet(ip, prefix, 'ipv6');
export function publicIP(address: string) {
  if (isIP(address) === 4) return !blocked.check(address, 'ipv4');
  // Only ordinary global IPv6 unicast; mapped, local, multicast and transition addresses are excluded.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !blocked.check(address, 'ipv6');
}
export async function publicFetch(raw: string, accept: 'html' | 'image', redirects = 0): Promise<{ bytes: Buffer; url: string }> {
  if (typeof raw !== 'string' || raw.length > 2000) throw new PublicError('El enlace es demasiado largo.');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hostname.endsWith('.local') || !url.hostname.includes('.')) throw new PublicError('Usá un enlace público que comience con https://.');
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([dns.lookup(url.hostname, { all: true, verbatim: true }), new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new PublicError('La tienda no respondió a tiempo.')), 3000); })]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some(a => !publicIP(a.address))) throw new PublicError('Ese enlace no apunta a un sitio público admitido.');
  const address = addresses[0];
  const cap = accept === 'html' ? 256 * 1024 : 1024 * 1024;
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'user-agent': 'PapelitoPreview/1.0', accept: accept === 'html' ? 'text/html' : 'image/jpeg,image/png,image/webp', 'accept-encoding': 'identity' },
      family: address.family,
      lookup: ((_host: unknown, _opts: unknown, callback: (err: Error | null, value: string, family: number) => void) => callback(null, address.address, address.family)) as https.RequestOptions['lookup'],
      timeout: 5000, maxHeaderSize: 16384,
    }, response => {
      if ([301,302,303,307,308].includes(response.statusCode || 0)) {
        response.resume(); if (redirects >= 2 || !response.headers.location) { reject(new PublicError('La tienda redirigió demasiadas veces.')); return; }
        publicFetch(new URL(response.headers.location, url).href, accept, redirects + 1).then(resolve, reject); return;
      }
      const contentType = response.headers['content-type'] || '';
      if (response.statusCode !== 200 || (accept === 'html' && !/^text\/html\b/i.test(contentType)) || (accept === 'image' && !/^image\/(jpeg|png|webp)\b/i.test(contentType))) {
        response.resume(); reject(new PublicError('La tienda no permite preparar esta referencia. Completala manualmente.')); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > cap) { request.destroy(); reject(new PublicError('La referencia es demasiado grande.')); } else chunks.push(Buffer.from(chunk)); });
      response.on('end', () => resolve({ bytes: Buffer.concat(chunks), url: url.href })); response.on('error', reject);
    });
    const timer = setTimeout(() => { request.destroy(); reject(new PublicError('La tienda no respondió a tiempo.')); }, 6000);
    request.on('close', () => clearTimeout(timer)); request.on('timeout', () => request.destroy(new PublicError('La tienda no respondió a tiempo.'))); request.on('error', reject);
  });
}
