# Sticker.pi Testnet — Reviewer Notes

## Review build

Version: **v1.0.1**

URL: https://sticker-pi-testnet.vercel.app

Sticker.pi is a short-session skill game and collectible album. Players complete a 30-second Sticker Catch challenge, earn server-verified progression, open three-sticker packs and build a 24-sticker collection.

## Recommended review path

1. Open the app in Pi Browser and authenticate with Pi.
2. Complete one 30-second Sticker Catch run generated from the server-issued Testnet daily seed.
3. Review score, accuracy, combo, XP, daily quest progress, Top 10 and personal rank.
4. A score of 25 or higher grants at most one gameplay pack per UTC day.
5. Open a pack and review rarity, NEW/DUPLICATE state and Album progress.
6. Open Trade and confirm it is marked “Coming soon”; no transfer is available.
7. Optionally purchase the 0.01 Test-Pi Bonus Pack.
8. Close and reopen the app to confirm server-side persistence.
9. Switch between English and Simplified Chinese.

## Security and persistence

- Pi access tokens are verified server-side through `/v2/me`.
- Important state is authoritative in Upstash Redis; local storage is only a display cache.
- Runs require a short-lived server-issued identifier, a Testnet-specific daily seed and plausibility checks.
- Only each Pioneer’s best verified UTC-day result is ranked; score, accuracy and best combo determine order.
- Player mutations use per-player Redis locks.
- Run, pack and paid-pack rewards are idempotent.
- Payment user, direction, Testnet network, amount, memo, metadata, transaction and final status are verified server-side.
- Credentials are server-side Vercel environment variables and are not present in the browser bundle.

## Intentional limitations

- Peer-to-peer exchange and Mainnet monetization are not active.
- The controlled A2U tester reward is hidden from ordinary use and depends on Pi Platform authorization.
- Test-Pi and Testnet progression have no guaranteed Mainnet or monetary value.

## Mainnet feature parity (Testnet isolation retained)

The Testnet build now supports two separate 24-sticker albums, duplicate conversion, a 500-gameplay-XP pack meter (up to three per UTC day), and four daily goals with one extra bonus pack per UTC day. Album 2 unlocks after Album 1 is complete; first selection grants one starter pack. Each album completion grants its badge, 250 XP and three packs once. Conversions retain at least one owned copy and cost 4/8/16/24 spare copies by rarity. Packs and run rewards are bound to their album. Existing 4/4 players receive the bonus on their next valid run that day.

Existing `sticker:player:*`, leaderboard and purchase records remain in place. The Testnet challenge namespace, SDK sandbox mode, product, price, credentials and controlled A2U endpoint are preserved. Previous payments without album metadata belong to Album 1. Inventory updates reject stale lock owners; opening and conversion receipts prevent duplicate delivery. No live payment or data reset is performed by tests.

Run `npm test` for UI, API, admin and the existing controlled-A2U mocks. Set `REDIS_TEST_SERVER` to a local redis-server executable for isolated Lua integration tests. Run `npm run check:build` for static syntax checks. Refresh the Testnet app in Pi Browser and verify both albums, the bonus and mobile rankings manually.
