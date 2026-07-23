import { describe, expect, it } from 'vitest';
import worker from './index.js';

const env = { PUBLIC_BASE_URL: 'https://checkhere.page' };

async function fetchPath(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request('https://checkhere.page' + path, init), env);
}

describe('CheckHere documentation Worker', () => {
  it('serves a local-first homepage for GET and HEAD', async () => {
    const response = await fetchPath('/');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('FREE · OPEN SOURCE · LOCAL FIRST');
    expect(body).toContain('checkhere setup');
    expect(body).toContain('https://github.com/Ryan-yang125/checkhere');
    expect(body).toContain('/example-report');
    expect(body).not.toContain('<form');
    expect(body).not.toContain('fetch(');

    const head = await fetchPath('/', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it.each([
    '/docs/cli',
    '/docs/skill',
    '/docs/github-actions',
    '/checks/broken-image',
    '/checks/mobile-overflow',
    '/checks/console-error',
    '/guides/ai-website-launch-checklist'
  ])('serves the indexable page %s for GET and HEAD', async (path) => {
    const response = await fetchPath(path);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(body).toContain('<link rel="canonical" href="https://checkhere.page' + path + '">');
    expect(body).toContain('application/ld+json');

    const head = await fetchPath(path, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('installs the v0.4.0 GitHub Release package and points to setup', async () => {
    const response = await fetchPath('/install.sh');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('VERSION="${CHECKHERE_VERSION:-0.4.0}"');
    expect(body).toContain('Ryan-yang125/checkhere/releases/download/v${VERSION}/checkhere-${VERSION}.tgz');
    expect(body).toContain('SHA256SUMS.txt');
    expect(body).toContain('Release checksum verification failed.');
    expect(body).toContain('Next: checkhere setup');
  });

  it('returns 410 local_only for the retired checks API', async () => {
    const response = await fetchPath('/v1/checks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' })
    });

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'local_only'
    });
  });

  it('publishes local-first llms.txt, sitemap, and fixed examples', async () => {
    const [llms, sitemap, example, markdown, reportJson] = await Promise.all([
      fetchPath('/llms.txt'),
      fetchPath('/sitemap.xml'),
      fetchPath('/example-report'),
      fetchPath('/example-report.md'),
      fetchPath('/example-report.json')
    ]);

    const llmsBody = await llms.text();
    const sitemapBody = await sitemap.text();

    expect(llmsBody).toContain('local-first');
    expect(llmsBody).toContain('/docs/github-actions');
    expect(llmsBody).toContain('https://skills.sh/ryan-yang125/checkhere/checkhere');
    expect(llmsBody).not.toContain('VPS');
    expect(llmsBody).not.toContain('hosted');
    expect(sitemapBody).toContain('<loc>https://checkhere.page/guides/ai-website-launch-checklist</loc>');
    expect(example.status).toBe(200);
    expect(markdown.headers.get('content-type')).toContain('text/markdown');
    expect(reportJson.headers.get('content-type')).toContain('application/json');
    await expect(reportJson.clone().json()).resolves.toMatchObject({ result: 'ready', score: 100, issues: [] });
  });
});
