# Sticker.pi — Testnet Verification Checklist

## Verified configuration

- [x] Separate Testnet repository and deployment
- [x] Development URL and domain ownership configured
- [x] PiNet subdomain configured
- [x] Pi SDK configured with `sandbox: true`
- [x] Pi SDK authentication works in Pi Browser
- [x] 0.01 Test-Pi User-to-App purchase completed
- [x] Payment fields and completion verified server-side
- [x] Privacy and Terms available
- [x] English and Simplified Chinese interface
- [x] Server-authoritative gameplay state
- [x] Server-issued run identifiers and plausibility checks
- [x] Testnet-specific deterministic daily challenge seed
- [x] Top 10 stores only each Pioneer’s best verified UTC-day result
- [x] Idempotent run, pack and payment rewards
- [x] Per-player locks and API rate limits
- [x] Incomplete-payment recovery implemented
- [x] Trade marked “Coming soon”
- [x] Controlled A2U card hidden from the normal review path
- [x] Version aligned to `v1.0.1`

## Environment separation

- [x] Testnet SDK uses `sandbox: true`
- [x] U2A payments require `Pi Testnet`
- [x] Testnet product identifier differs from Mainnet
- [x] Testnet and Mainnet repositories and deployments are separate
- [x] Testnet data is not migrated to Mainnet
- [x] No Mainnet wallet secret is required by the Testnet user flow

## Final manual checks

- [ ] Open the latest Testnet production deployment in Pi Browser
- [ ] Confirm footer displays `Sticker.pi Testnet · v1.0.1`
- [ ] Confirm login, one full run, pack opening, Album and Profile
- [ ] Confirm Top 10 and personal daily rank update after a verified run
- [ ] Confirm one 0.01 Test-Pi U2A purchase or purchased state
- [ ] Confirm Trade displays “Coming soon”
- [ ] Confirm Privacy and Terms links open
- [ ] Confirm the A2U card is absent without `?claim=a2u`

## Mainnet feature parity (Testnet isolation retained)

The Testnet build now supports two separate 24-sticker albums, duplicate conversion, a 500-gameplay-XP pack meter (up to three per UTC day), and four daily goals with one extra bonus pack per UTC day. Album 2 unlocks after Album 1 is complete; first selection grants one starter pack. Each album completion grants its badge, 250 XP and three packs once. Conversions retain at least one owned copy and cost 4/8/16/24 spare copies by rarity. Packs and run rewards are bound to their album. Existing 4/4 players receive the bonus on their next valid run that day.

Existing `sticker:player:*`, leaderboard and purchase records remain in place. The Testnet challenge namespace, SDK sandbox mode, product, price, credentials and controlled A2U endpoint are preserved. Previous payments without album metadata belong to Album 1. Inventory updates reject stale lock owners; opening and conversion receipts prevent duplicate delivery. No live payment or data reset is performed by tests.

Run `npm test` for UI, API, admin and the existing controlled-A2U mocks. Set `REDIS_TEST_SERVER` to a local redis-server executable for isolated Lua integration tests. Run `npm run check:build` for static syntax checks. Refresh the Testnet app in Pi Browser and verify both albums, the bonus and mobile rankings manually.
