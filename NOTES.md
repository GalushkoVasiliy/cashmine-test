# Notes

## Decisions

- **Money is BigInt in the smallest unit.** Server strings are parsed strictly (`^(0|[1-9]\d*)(\.\d+)?$`, at most `decimals` places) and formatted back to the same format, so what we send always matches what the API accepts. USD is kept exact (`units × price` at a combined scale) and rounded half-up to cents only for display. Live check: per-asset rounding would give $31,046.01; the exact total, which the app shows, is $31,046.02.
- **Comma input:** the field turns a single `,` into `.`; the parser itself stays strict. Ambiguous input such as `1,000.5` is rejected, never guessed.
- **USD headline = available only** (what can be claimed now). Pending and claiming are shown as separate USD totals so they are never mixed into the claimable number.
- **Error classes:** definite (400/404/409), unauthorized (401 → token screen, only for the token currently in use), rate-limited (429, wait `retryAfterMs` / `Retry-After`), retryable (GET 5xx/504/network: full-jitter backoff, 4 attempts), unknown (POST 5xx/504/network). Identical in-flight GETs are shared per token; changing the token cancels and clears the cache.
- **Idempotency-Key lifecycle:** a UUID per *confirmed* claim, saved with the exact body in localStorage **before** the first POST. Every retry, and every resume after a reload, sends the same key + body. A new key only comes from a new confirmed claim. 409 is treated as a bug ("request changed under the same key").
- **Unknown outcome is never "failed".** The status screen says "Checking your claim…" and a background runner resends the same key + body (backoff capped at 10s, honouring 429) until a definite answer. Same key + same body can only return the original claim, so this cannot double-claim.
- **Balance right after a claim:** snapshots lag up to 15s. I asked for alternatives and got three (local overlay / raw data + banner / block until a fresh snapshot). We chose the **overlay**: until a snapshot with `asOf >= claim.createdAt` arrives, the claim amount moves from available to claiming in the UI ("Updating after your claim…"). Unresolved claims are overlaid too, so Max never offers money that may already have left. A failed claim shows "returned to available".
- **Max vs a stale snapshot:** Max uses the overlaid available. The server checks live; if it rejects, the status screen shows the server's reason and "Edit and try again" refetches balances.
- **Double submit:** a guard on Confirm, plus only one unresolved claim at a time (the form redirects to its status).
- **Polling:** pending claims are polled every 2s for the first 10 polls, then every 5s, both on the status screen and in the background (one shared query). Balances refresh every 15s, matching the snapshot cadence.

## Working with AI

All in `ai-logs/session-build.md` (raw: `session-build.jsonl`). Claude Code built the app; I made the calls on the risky parts.

1. **Pushing back on the comma question** (search "what we have in a ticket"). Asked how to treat `0,5`, I asked what the ticket/API actually say. The answer: the API only defines the wire format, so the choice is UI-only. That led to "normalise in the input, strict parser underneath" instead of loosening the parser.
2. **Choosing between approaches for the post-claim balance** (search "Local overlay until snapshot"). The AI gave three options with tradeoffs; I picked the overlay. The same batch of questions settled the idempotency key lifecycle and the unknown-outcome UX before any code was written.
3. **A test catching a real bug** (search `Received: "sending"`). The unit test for "never failed while unknown" failed: an abort right after a 5xx left the claim as "sending". The order was fixed so the state is recorded first. Later, asked "any issues left?", the AI found two more bugs (a stuck "processing" banner when the status screen was closed; a late 401 from an old token could log out a new one). Both were fixed with tests.

Token safety: the API token was never pasted into this session; I typed it into the app myself. The AI checked this with a SHA-256 fingerprint of the token (computed in the page) against the logs and the repo: 0 matches in `ai-logs/` and in tracked files. Earlier sessions that did contain it are not included. Email and unrelated project folder names are redacted.

## Not done / known issues

- A real claim against the live API was not submitted during testing. The claim flow (504 → checking → replay → completed) was exercised against a stubbed API; balances, USD maths and claim options were checked live.
- No manual "Keep trying" button; while the app is open it retries automatically, at most 10s apart.
- If a claim fails while the app isn't polling it, the overlay can show the amount as taken until the next snapshot (≤15s).
- In-flight GET retries for an old token run to completion after a token change (the results are discarded).
- No component/E2E tests; the unit tests cover money, the client, claim intents/overlay, freshness and activity dedupe.
- Activity amounts are shown as the server strings (already exact); there is no per-asset formatting there.
