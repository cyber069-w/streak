import { describe, expect, it } from 'vitest';
import { createGitHub } from './github';
import { toBase64 } from '../lib/crypto';

describe('GitHub client', () => {
  it('reads files as raw blobs, not the (possibly transcoded) contents field', async () => {
    const bytes = new Uint8Array([0x4e, 0x48, 0x53, 0x59, 1, 47, 200, 0, 255]);
    const fetchFn = (async (url: string) => {
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      // GitHub may treat binary files as UTF-16 text and return a transcoded copy in `content`
      if (url.endsWith('/contents/progress.enc')) return json({ sha: 'abc', content: toBase64(new TextEncoder().encode('么卙…')) });
      if (url.endsWith('/git/blobs/abc')) return json({ sha: 'abc', encoding: 'base64', content: toBase64(bytes).replace(/(.{4})/g, '$1\n') });
      return new Response('{}', { status: 404 });
    }) as typeof fetch;
    const gh = createGitHub('t', { owner: 'me', repo: 'sync' }, fetchFn);
    const file = await gh.getFile('progress.enc');
    expect(file?.sha).toBe('abc');
    expect([...file!.bytes]).toEqual([...bytes]);
  });
});
