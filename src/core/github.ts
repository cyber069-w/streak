/**
 * Minimal GitHub REST client for the sync file (contents API). Runs in the browser,
 * talks to api.github.com directly with your token – no server of our own.
 */
import { fromBase64, toBase64 } from '../lib/crypto';

export interface RepoRef { owner: string; repo: string }

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
/** The file changed on GitHub since we read it – read again and merge. */
export class ConflictError extends GitHubError {}

/** "owner/repo" or a GitHub URL → { owner, repo } */
export function parseRepo(input: string): RepoRef | null {
  const m = /^(?:https?:\/\/github\.com\/)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(input.trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

export interface GitHubClient {
  repoInfo(): Promise<{ private: boolean; fullName: string }>;
  getFile(path: string): Promise<{ sha: string; bytes: Uint8Array } | null>;
  putFile(path: string, bytes: Uint8Array, sha: string | undefined, message: string): Promise<string>;
}

export function createGitHub(token: string, ref: RepoRef, fetchFn: typeof fetch = (...a) => fetch(...a)): GitHubClient {
  const base = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;
  const headers = {
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await fetchFn(url, { ...init, cache: 'no-store', headers: { ...headers, ...(init.headers ?? {}) } });
    } catch {
      throw new GitHubError('No connection to GitHub.', 0);
    }
    if (res.ok) return res;
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    const msg = body.message ?? '';
    if (res.status === 409 || (res.status === 422 && /sha/i.test(msg))) throw new ConflictError('The sync file changed meanwhile.', res.status);
    if (res.status === 401) throw new GitHubError('GitHub didn’t accept the token – it may have expired. Create a new one and connect again.', 401);
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') throw new GitHubError('GitHub’s rate limit is reached – sync continues later.', 403);
    if (res.status === 403) throw new GitHubError('The token may not write to this repository – give it “Contents: Read and write”.', 403);
    if (res.status === 404) throw new GitHubError(`Repository ${ref.owner}/${ref.repo} not found – check the name and that the token has access to it.`, 404);
    throw new GitHubError(`GitHub error ${res.status}${msg ? `: ${msg}` : ''}`, res.status);
  }

  return {
    async repoInfo() {
      const j = (await (await call(base)).json()) as { private: boolean; full_name: string };
      return { private: j.private, fullName: j.full_name };
    },

    async getFile(path) {
      let res: Response;
      try {
        res = await call(`${base}/contents/${path}`);
      } catch (e) {
        if (e instanceof GitHubError && e.status === 404) return null; // no sync file yet
        throw e;
      }
      const j = (await res.json()) as { sha: string };
      // Always read the raw blob: the contents API may treat binary files as text and
      // transcode them (e.g. the encrypted file read as UTF-16), which corrupts the bytes.
      const blob = (await (await call(`${base}/git/blobs/${j.sha}`)).json()) as { content: string };
      return { sha: j.sha, bytes: fromBase64(blob.content) };
    },

    async putFile(path, bytes, sha, message) {
      const res = await call(`${base}/contents/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, content: toBase64(bytes), ...(sha ? { sha } : {}) }),
      });
      const j = (await res.json()) as { content: { sha: string } };
      return j.content.sha;
    },
  };
}
