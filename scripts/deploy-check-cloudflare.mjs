// scripts/deploy-check-cloudflare.mjs: the Cloudflare Pages half of the deploy gate (scripts/deploy-check.mjs).
//
// Pure pieces (the deploy that matches a commit, what its stage means, the exit code a state maps to) plus one probe
// whose `fetch` is injected, so node:test covers it all with no network. deploy.yml deploys with
// `wrangler pages deploy ... --commit-hash "$GITHUB_SHA"`; that hash lands in
// `deployment_trigger.metadata.commit_hash`, which is what a deploy is matched by here.
//
// Exit codes (plan/bearings.md, Verify gate): 0 ready, 1 error, 2 timeout, 3 config or auth.

export const EXIT = { ready: 0, error: 1, timeout: 2, config: 3 };

/** The exit code for a terminal state; null while the deploy is still moving. */
export function exitCodeFor(state) {
  return Object.hasOwn(EXIT, state) ? EXIT[state] : null;
}

/**
 * The deploy for `sha` among a Pages deployments list: production first (a push to main), then the newest by
 * `created_on` (a retried deploy of the same commit supersedes the earlier one). Undefined when none matches.
 */
export function matchDeployment(deployments, sha) {
  const hits = (deployments ?? []).filter((d) => d?.deployment_trigger?.metadata?.commit_hash === sha);
  if (hits.length === 0) return undefined;
  const prod = hits.filter((d) => d.environment === 'production');
  const pool = prod.length ? prod : hits;
  return [...pool].sort((a, b) => String(b.created_on ?? '').localeCompare(String(a.created_on ?? '')))[0];
}

const FAILED = new Set(['failure', 'canceled']);

/**
 * What one deployment means to the gate: `ready` only once its last stage (`deploy`) succeeded; `error` when any
 * stage failed or was canceled; otherwise its stage and status, still moving. A direct upload's stages are
 * queued, initialize, clone_repo, build, deploy; an earlier stage's `success` is not the end.
 */
export function classify(deployment, { account, project } = {}) {
  const stage = deployment.latest_stage ?? {};
  const id = typeof deployment.id === 'string' ? deployment.id.slice(0, 8) : undefined;
  if (stage.name === 'deploy' && stage.status === 'success') {
    return { state: 'ready', url: deployment.url, id };
  }
  if (FAILED.has(stage.status)) {
    return {
      state: 'error',
      message: `stage "${stage.name ?? 'unknown'}" ${stage.status}`,
      admin: account && project ? `https://dash.cloudflare.com/${account}/pages/view/${project}/${deployment.id}` : undefined,
      id,
    };
  }
  return { state: stage.name ? `${stage.name}:${stage.status ?? 'pending'}` : 'pending', id };
}

/**
 * One poll of the Pages API. Returns a pollLoop result (`{ state, ... }`), `null` for a transient API error worth
 * retrying, or `{ state: 'config', message }` when retrying cannot help (token rejected, project or account missing).
 */
export async function probeCloudflare({ fetch, token, account, project, sha }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${encodeURIComponent(project)}/deployments`;
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return null;
  }
  if (res.status === 401 || res.status === 403) {
    return { state: 'config', message: `Cloudflare API refused the token (HTTP ${res.status}); it needs Cloudflare Pages: Edit on the account.` };
  }
  if (res.status === 404) {
    return { state: 'config', message: `No Pages project "${project}" on this account (HTTP 404). Create it: wrangler pages project create ${project} --production-branch main.` };
  }
  if (!res.ok) return null;
  let data;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const match = matchDeployment(data?.result, sha);
  if (!match) return { state: 'pending' };
  return classify(match, { account, project });
}
