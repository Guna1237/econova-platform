# Trading Sim — Cleanup & Hardening Pass

You are working on a finance club trading simulation. Read this whole file before touching code. Work section by section, in order. Commit after each section with a clear message.

## Ground rules (apply everywhere)

1. **Investigate before editing.** For each section: read the relevant files, summarize the actual current behavior in 2–3 lines, then make the change. Do not rewrite files you weren't asked to touch.
2. **Minimal diffs.** No drive-by refactors, no renaming, no reformatting unrelated code.
3. **No AI-sounding copy anywhere** — UI strings, news content, comments, commit messages. See `STYLE.md`. No em dashes, no "delve / leverage / robust / seamless / navigate the landscape", no tricolons, no "It's not just X, it's Y." Write like a tired student would.
4. **Ask, don't assume**, on anything marked ⚠️.
5. **Batch reads.** Open files once, hold context, don't re-grep the same thing.

---

## 1. Fix: Sub-admin trade approvals 403

**Symptom:** `GET /admin/trade-approvals` → 403 from `AdminTradeApprovals.jsx` when the logged-in user is a sub-admin.

**Do this:**
- Find the route handler for `/admin/trade-approvals` (backend) and check its auth dependency.
- It almost certainly requires `role == "admin"` only. Sub-admins need access too.
- Either: (a) widen the dependency to accept admin OR sub-admin, or (b) split into `/admin/...` and `/subadmin/...` if scopes should differ.
- Check every other endpoint the sub-admin dashboard calls and fix the same way if broken.

Report back: list of endpoints touched + the auth rule applied to each.

---

## 2. Sub-admin UI consistency + branding

- Make the sub-admin dashboard visually consistent with the main admin dashboard (same layout primitives, spacing scale, button styles, table styles). Do NOT redesign — match what already exists for admin.
- Add university logo (top-left) and club logo (next to it or top-right — pick what looks balanced). Logo files: ask me where they are if not in `public/` or `assets/`.
- Avoid the generic "AI dashboard" look: no purple gradients, no glassmorphism, no emoji in headings, no centered hero text. Plain, dense, functional. Think Bloomberg-lite, not a SaaS landing page.

---

## 3. Portfolio: verify buy/sell buttons in row

- Open the portfolio table component. Confirm each holding row has working Buy and Sell buttons inline.
- If missing → add them, wire to the existing trade modal/endpoint.
- If present but broken → fix.
- Do not redesign the table.

---

## 4. Pre-seed news & prices: make editable + de-AI the content

**Editing:**
- Locate the seed file(s) for news and starting prices.
- If they're hardcoded in Python/JS, move to a single `seeds/news.json` + `seeds/prices.json` (or yaml — pick whatever matches existing convention).
- Add a short `seeds/README.md` explaining the schema in 5 lines.

**Content rewrite:**
- Rewrite every existing seeded news headline + body to sound like real wire copy or a student stringer wrote it. Vary length. Some should be boring 2-line briefs, some 4-line analysis. Mix sources (Reuters, Bloomberg, Mint, ET Markets, PTI, a couple of substack-style ones).
- No em dashes. No "amid", "underscores", "signals a shift", "navigates", "robust", "key". No tricolons. No headlines ending in a question.
- Don't make the news telegraph the shock direction. A real trader has to read between lines.

---

## 5. Secondary auction hall

- Create a separate auction hall (route + page + backend endpoints) distinct from the primary one.
- Likely needs: `auctions_secondary` table (or a `hall` column on existing auctions table — pick whichever is less invasive, justify in 1 line), separate listing page, separate admin controls.
- Reuse existing auction logic/components. Do not fork the code.

---

## 6. Admin starting capital

- Bump admin's starting cash to an effectively unlimited amount (e.g., 10^12). Find the constant, change it, done. Note the file + line in your report.

---

## 7. ⚠️ Pricing formula review — ASK FIRST

Before changing anything:
- Read the current pricing logic end-to-end.
- Write a short summary (max 15 lines) of: how prices move on trades, how shocks apply, how news affects price, any liquidity/slippage model, edge cases (zero liquidity, huge order, etc.).
- List 3–5 concrete weaknesses you see (e.g., "constant-product would prevent runaway prices on small floats" or "current linear impact lets a team move price 40% with one trade").
- **STOP. Show me the summary + suggestions. Wait for my pick before implementing.**

---

## 8. Anti-cheat / anti-collusion measures

Add lightweight, transparent checks. Don't build a fraud-detection system, just close obvious holes.

- **Wash trading / self-dealing:** block trades where buyer team == seller team (including via private trades).
- **Collusion pricing:** flag (don't block) private trades where price deviates from market mid by > X% (default 15%, configurable). Show flagged trades on a new admin tab "Flagged Activity".
- **Rate limit:** cap trades per team per minute (default 30, configurable) at the API layer.
- **Audit log:** ensure every trade, approval, news publish, and shock has a row in an `audit_log` table with actor, action, timestamp, payload. If it exists, verify it covers all four. If not, add it.
- **Session integrity:** confirm JWTs are signed (not just base64), have an expiry, and that role is server-checked on every protected route, not trusted from the client.

Report what already existed vs what you added.

---

## 9. Bots: verify and document

- Find the bot logic. Run a quick simulation (10 ticks) and confirm bots actually place trades and respond to price/news as intended.
- If they don't trade, or trade nonsensically, fix the obvious bugs only — don't redesign the strategy.
- Write 1 short paragraph in your report on: what each bot does, whether it currently works, whether it's actually useful for liquidity / market depth.

---

## 10. Event flow enforcement

- Confirm the event has clear states: `setup → registration → trading_open → shock_X → trading_open → ... → settlement → results`.
- If state transitions are loose (e.g., trades possible during settlement), tighten them at the API layer.
- One admin button per transition. No way to skip states accidentally.

---

## 11. Documentation — three markdown files in `/docs`

Write all three in plain prose. Short sentences. No marketing voice. No bullet-soup where paragraphs work better. No em dashes.

### `docs/TECH_STACK.md`
Cover: frontend framework + key libs, backend framework + key libs, database + ORM, auth approach, deployment setup (if any), how to run locally, env vars needed. Aim for ~400–600 words. Concrete, not flowery.

### `docs/ARCHITECTURE_AND_DECISIONS.md`
Cover: data model (tables + relationships), pricing formula (final version after section 7), shock mechanism (high-level — this file is internal, can be detailed), auction logic, bot logic, anti-cheat measures, event state machine, key trade-offs made and why. This is the "if I get hit by a bus, the next person can run the event" doc. Be thorough, ~1500–2500 words.

### `docs/PARTICIPANT_GUIDE.md`
Audience: students playing the game. Tell them how to log in, navigate the dashboard, read the news feed, place a market trade, place a private trade, join an auction (primary + secondary), check portfolio + P&L, what the leaderboard means.

**Critical:** Do NOT mention shocks at all. Do NOT explain how news affects prices. Do NOT describe the pricing formula. Do NOT hint at bot behavior. Treat the market as a black box from the participant's POV — they should figure out signal from noise themselves.

Tone: like a senior in the club explaining it to a junior over chai. Clear, slightly informal, no hype. ~800–1200 words.

---

## Final report format

When done, give me ONE message with:
1. Section-by-section: what you did, files changed, anything skipped + why.
2. The pricing summary from section 7 (if I haven't already responded).
3. Anything broken or suspicious you noticed but didn't fix because it was out of scope.

Keep the report tight. No restating the task. No "I have successfully completed..." preamble.