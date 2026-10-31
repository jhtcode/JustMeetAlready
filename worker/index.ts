/**
 * Cloudflare Worker entry point.
 *
 * - /api/* goes to the API router (worker/app.ts), backed by D1.
 * - Everything else goes to the built frontend in dist/ via Static Assets.
 *   A request that is not a real asset (for example /e/<id>, which the
 *   React app also reads) falls back to /index.html so the SPA can route it.
 *   Unknown /api/* routes never fall back to the SPA shell; they get JSON 404s.
 */
import { createApiHandler } from './app';
import { D1Store } from './store';
import type { Env } from './d1';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const store = new D1Store(env.DB);
      await store.init();
      return createApiHandler(store)(request);
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;

    // SPA fallback.
    const fallback = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    return fallback;
  },
};
