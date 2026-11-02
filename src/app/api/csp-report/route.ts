import { logEvent } from '@/lib/observability/log';

// Receives Content-Security-Policy-Report-Only reports (legacy report-uri and
// the Reporting API). It only logs the directive, the kind or origin of the
// blocked resource and the page path with ids removed: never full URLs, query
// strings, code samples or cookies. It blocks nothing and always answers 204.
const MAX_BODY = 16_384;
const MAX_REPORTS = 10;
const KEYWORDS = /^(inline|eval|wasm-eval|self|trusted-types-policy|trusted-types-sink)$/;

function blockedKind(value: unknown) {
  if (typeof value !== 'string' || !value) return 'none';
  if (KEYWORDS.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'data:' || url.protocol === 'blob:') return url.protocol.slice(0, -1);
    return url.origin === 'null' ? 'other' : url.origin;
  } catch {
    return 'other';
  }
}

function pagePath(value: unknown) {
  if (typeof value !== 'string') return 'unknown';
  try { return new URL(value).pathname; } catch { return 'unknown'; }
}

type Violation = { directive: string; blocked: string; path: string; disposition: string };

function readReports(payload: unknown): Violation[] {
  const items = Array.isArray(payload) ? payload : [payload];
  const out: Violation[] = [];
  for (const item of items.slice(0, MAX_REPORTS)) {
    if (!item || typeof item !== 'object') continue;
    const legacy = (item as Record<string, unknown>)['csp-report'] as Record<string, unknown> | undefined;
    const modern = (item as { type?: unknown; body?: Record<string, unknown> }).type === 'csp-violation' ? (item as { body?: Record<string, unknown> }).body : undefined;
    const report = legacy ?? modern;
    if (!report || typeof report !== 'object') continue;
    const directive = String(report['effective-directive'] ?? report.effectiveDirective ?? report['violated-directive'] ?? 'unknown').split(' ')[0].slice(0, 40);
    out.push({
      directive: /^[a-z-]+$/.test(directive) ? directive : 'unknown',
      blocked: blockedKind(report['blocked-uri'] ?? report.blockedURL),
      path: pagePath(report['document-uri'] ?? report.documentURL),
      disposition: report.disposition === 'enforce' ? 'enforce' : 'report',
    });
  }
  return out;
}

export async function POST(request: Request) {
  const type = request.headers.get('content-type') ?? '';
  if (!/^application\/(csp-report|reports\+json|json)\b/i.test(type)) return new Response(null, { status: 415 });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return new Response(null, { status: 413 });
  const text = await request.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
  for (const violation of readReports(payload)) logEvent('warn', 'csp_violation', violation);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
