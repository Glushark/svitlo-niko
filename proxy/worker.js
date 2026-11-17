const ALLOWED_ORIGIN = 'https://glushark.github.io';
const UPSTREAMS = {
  times: 'https://off.energy.mk.ua/api/schedule/time-series',
  active: 'https://off.energy.mk.ua/api/v2/schedule/active',
  queues: 'https://off.energy.mk.ua/api/outage-queue/by-type/3'
};

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };

    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response('Origin not allowed', { status: 403, headers: cors });
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    const resource = new URL(request.url).searchParams.get('resource');
    const target = UPSTREAMS[resource];
    if (!target) return new Response('Unknown resource', { status: 404, headers: cors });

    try {
      const upstream = await fetch(target, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 0, cacheEverything: false } });
      const headers = new Headers(cors);
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json; charset=utf-8');
      headers.set('Cache-Control', 'no-store');
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch {
      return new Response(JSON.stringify({ error: 'Could not reach the outage schedule API' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
  }
};
