# Deploying JustMeetAlready on Cloudflare — $0

This is the Cloudflare version of the app. The frontend is the same React
app, served as static assets by a Worker. The API is `worker/` (not
`server.ts`), and every event lives in Cloudflare D1, a managed SQLite
database that survives Worker restarts, redeploys, and cold starts.
That is the fix for the old bug: the old deployment kept events in a
JSON file on the server's own disk, which Cloud Run wiped on restart.

No credit card is required for the Workers Free plan or for D1's free
allowance. If you go over a free limit, requests fail instead of
billing you — there is no card on file to charge.

## Free limits that matter here

- Workers Free: 100,000 requests per day, 10 ms CPU per invocation.
- D1 Free: 5 million rows read per day, 100,000 rows written per day,
  5 GB total storage.
- Why polling does not blow this up: the frontend polls every 3 seconds
  while the tab is visible, but each event is stored as one JSON row and
  each participant as one JSON row — not one row per 15-minute slot.
  A poll reads roughly one event row plus one row per participant, so
  even a dozen people polling all day is tens of thousands of row
  reads, not millions.

## One-time setup

```bash
npm install
npx wrangler login          # opens Cloudflare in your browser; free account, no card
npm run db:create           # wrangler d1 create justmeetalready
```

`db:create` prints a `database_id`. Paste it into `wrangler.toml`,
replacing `REPLACE_WITH_WRANGLER_D1_CREATE_ID`, then:

```bash
npm run db:migrate          # creates the events / participants / signin_failures tables
npm run deploy              # builds the frontend, then deploys the Worker
```

Your app is live at `https://justmeetalready.<your-subdomain>.workers.dev`
(or a custom domain added in the Cloudflare dashboard — also free).

## Local development

```bash
npm run dev                 # builds the frontend, then wrangler dev with a local D1
```

Local D1 is a file wrangler manages for you; it is not the remote
database. To test against the real remote D1 from your machine, use
`wrangler dev --remote` (careful: that reads and writes real data).

## What does NOT carry over from the old deployment

- Old events and old participant passwords do not migrate. The old
  data lived on an ephemeral disk and is already gone, and passwords
  were scrypt hashes from Node, while this Worker uses PBKDF2 via
  WebCrypto (Workers have no Node scrypt). Recreate events and have
  people sign in fresh.
- `server.ts` is legacy and is not used by this deployment. It is kept
  in the repo for reference only; do not run it in production, or you
  are back to the ephemeral-disk bug.

## Notes and limits to know

- Rate limits in `worker/app.ts` are per-isolate in-memory (best
  effort). The security-critical lockout — 10 wrong passwords in
  15 minutes — is stored in D1 (`signin_failures`), so it cannot be
  dodged by landing on a fresh isolate.
- Sessions last 30 days and only the SHA-256 hash of each session
  token is stored. Password hashes are salted PBKDF2 and are never
  sent to the client.
- Backups: D1 has no automatic export on the free plan. Before risky
  changes, run `npx wrangler d1 export justmeetalready --remote
  --output backup.sql` (or `--local` for the local database) and keep
  that file somewhere safe.
- If you ever outgrow the free plan, the first paid step is Workers
  Paid ($5/month for the account), not a per-app charge. Nothing in
  this code needs to change to move to it.
