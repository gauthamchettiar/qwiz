# Deploy setup (Cloudflare Pages)

One-time setup so `.github/workflows/ci.yml`'s `deploy` job can push `dist/` to Cloudflare Pages
at `qwiz.gauthamchettiar.com`. Project name is hardcoded as `qwiz` in the workflow
(`--project-name=qwiz`) — must match exactly everywhere below.

## 1. Create the Pages project

**Must be a Pages project, not a Worker.** The Cloudflare dashboard's "Create" flow defaults to
Workers, which is a separate product/namespace from Pages — a Worker named `qwiz` does not satisfy
`wrangler pages deploy`'s requirement for a Pages project named `qwiz`, and produces the same
"project does not exist" error. Avoid the dashboard ambiguity by using the CLI:

```bash
CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account id> \
  npx wrangler pages project create qwiz --production-branch=main
```

(A temporary token with the permission from step 2 works fine here — doesn't have to be the final
one.)

## 2. API token

Dashboard → profile icon → **My Profile** → **API Tokens** → **Create Token** → **Custom token**.

- **Permissions**: `Account` → `Cloudflare Pages` → `Edit`. Nothing else — no Workers Scripts, no
  Zone/DNS (custom domain attach in step 4 is a one-time dashboard action, not something the
  deploy token touches).
- **Account Resources**: `Include` → your specific account, not "All accounts".
- **TTL**: set an expiration (e.g. 1 year) — nothing else will remind you to rotate this.

Copy the token (shown once) → this is `CLOUDFLARE_API_TOKEN`.

`CLOUDFLARE_ACCOUNT_ID` is in the dashboard's right sidebar on any domain Overview page, or in the
Workers & Pages dashboard URL (`dash.cloudflare.com/<account-id>/...`).

## 3. GitHub secrets

Repo → Settings → **Environments** → `production` (matches `environment: production` in the
`deploy` job) → add both:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Scoping to the `production` environment (not repo-wide Actions secrets) means only the `deploy`
job can read them — `verify`/`unit`/`build`/`e2e` can't.

`secrets.GITHUB_TOKEN` (used for the optional `gitHubToken:` input, which only creates GitHub
Deployment records — doesn't affect the actual Cloudflare deploy) needs no setup: it's
auto-generated per run, scoped by the `deploy` job's existing `permissions: { deployments: write }`.

## 4. Custom domain

Zone (`gauthamchettiar.com`) must already be on Cloudflare (check via `dig NS gauthamchettiar.com`
— should return `*.ns.cloudflare.com`). Then: Workers & Pages → `qwiz` project → **Custom
domains** → Add → `qwiz.gauthamchettiar.com`. Auto-creates the proxied CNAME; doesn't touch any
other subdomain or the apex.

## 5. Verify

Push to `main` (or re-run the workflow) → `deploy` job should complete → check
`qwiz.gauthamchettiar.com`.
