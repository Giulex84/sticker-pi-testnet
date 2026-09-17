# Sticker.pi Testnet — Reviewer Notes

## Review build

Version: **v1.0.0**

URL: https://sticker-pi-testnet.vercel.app

Sticker.pi is a short-session skill game and collectible album. Players complete a 30-second Sticker Catch challenge, earn server-verified progression, open three-sticker packs and build a 24-sticker collection.

## Recommended review path

1. Open the app in Pi Browser and authenticate with Pi.
2. Complete one 30-second Sticker Catch run.
3. Review score, accuracy, combo, XP and daily quest progress.
4. A score of 25 or higher grants at most one gameplay pack per UTC day.
5. Open a pack and review rarity, NEW/DUPLICATE state and Album progress.
6. Open Trade and confirm it is marked “Coming soon”; no transfer is available.
7. Optionally purchase the 0.01 Test-Pi Bonus Pack.
8. Close and reopen the app to confirm server-side persistence.
9. Switch between English and Simplified Chinese.

## Security and persistence

- Pi access tokens are verified server-side through `/v2/me`.
- Important state is authoritative in Upstash Redis; local storage is only a display cache.
- Runs require a short-lived server-issued identifier and plausibility checks.
- Player mutations use per-player Redis locks.
- Run, pack and paid-pack rewards are idempotent.
- Payment user, direction, Testnet network, amount, memo, metadata, transaction and final status are verified server-side.
- Credentials are server-side Vercel environment variables and are not present in the browser bundle.

## Intentional limitations

- Peer-to-peer exchange, leaderboards and Mainnet monetization are not active.
- The controlled A2U tester reward is hidden from ordinary use and depends on Pi Platform authorization.
- Test-Pi and Testnet progression have no guaranteed Mainnet or monetary value.
