## Seeds

These files are loaded by `POST /admin/seed-history` to pre-populate two years of price history and news before the trading session starts.

**prices.json** — object mapping asset ticker to array of 8 prices (Year 1 Q1 through Year 2 Q4).

**news.json** — array of news items. Fields: `title`, `content`, `category` (market/company/macro/decoy/fun/bait), `sim_year` (1 or 2, null for draft items), `sim_quarter` (1-4, null for drafts), `is_published` (true = visible to participants immediately, false = admin publishes manually during the game), `image_url`, `source`.
