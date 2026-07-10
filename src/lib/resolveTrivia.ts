import type { Trivia } from './types';
import { getTrivia } from './store';
import { fetchGithubTrivia, parseRepoInput } from './github';

export type ResolvedTrivia =
  | { trivia: Trivia; readOnly: false; source: 'local' }
  | { trivia: Trivia; readOnly: true; source: 'github'; owner: string; repo: string; ref: string; path: string }
  | { trivia: null; readOnly: true; source: 'github'; error: string };

/**
 * Resolves the trivia a page should show from its URL query params.
 *
 * Local trivias keep the `?id=<uuid>` shape (synchronous localStorage lookup). GitHub-sourced
 * ones are `?github=owner/repo&id=<path-within-quiz-data>` — shareable as-is, since `ref`
 * (branch) is optional and gets resolved cache-first, falling back to one API call. An
 * optional `&ref=<branch>` can be included as a fast path when it's already known (e.g.
 * navigating from the Browse page, which just resolved it) to skip that lookup entirely.
 */
export async function resolveTriviaFromParams(params: URLSearchParams): Promise<ResolvedTrivia | null> {
  const githubParam = params.get('github');
  if (githubParam) {
    const parsed = parseRepoInput(githubParam);
    const path = params.get('id') ?? '';
    if (!parsed || !path) {
      return { trivia: null, readOnly: true, source: 'github', error: 'Malformed GitHub trivia link.' };
    }
    const ref = params.get('ref') ?? undefined;
    const result = await fetchGithubTrivia(parsed.owner, parsed.repo, path, ref);
    return result.ok
      ? {
          trivia: result.trivia,
          readOnly: true,
          source: 'github',
          owner: parsed.owner,
          repo: parsed.repo,
          ref: result.ref,
          path
        }
      : { trivia: null, readOnly: true, source: 'github', error: result.error };
  }

  const id = params.get('id');
  if (!id) return null;
  const own = getTrivia(id);
  return own ? { trivia: own, readOnly: false, source: 'local' } : null;
}
