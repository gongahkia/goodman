import { serve } from '@hono/node-server';
import { createHostedApp } from './app';

const port = parseInt(process.env.PORT ?? '8787', 10);
const app = createHostedApp({
  config: {
    upstreamApiKey: process.env.HOSTED_UPSTREAM_API_KEY ?? '',
    upstreamModel: process.env.HOSTED_UPSTREAM_MODEL ?? 'gpt-4.1-mini',
    upstreamUrl: process.env.HOSTED_UPSTREAM_BASE_URL,
    timeoutMs: parseInt(process.env.HOSTED_REQUEST_TIMEOUT_MS ?? '10000', 10),
  },
});

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Goodman Cloud listening on http://127.0.0.1:${info.port}`);
  }
);
