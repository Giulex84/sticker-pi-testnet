# Sticker.pi Testnet

Sticker.pi Testnet is the isolated testing build of the Pi Network collectible skill game.

## Test release

Current release: **v1.1.2**

Testnet URL: https://sticker-pi-testnet.vercel.app

Testnet and Mainnet use separate repositories, Vercel projects, Pi app credentials, payment products and persistent data.

## Active Testnet features

- Pi SDK authentication with `username` and `payments` scopes
- Verified 0.01 Test-Pi User-to-App Bonus Pack purchase
- Server-side payment approval, completion, recovery and validation
- Daily 30-second Sticker Catch challenge with a server-issued Testnet-specific deterministic seed
- Daily Top 10 ranked by verified score, accuracy and best combo, with personal position
- Server-authoritative XP, levels, daily streaks, quests, packs and inventory
- Two 24-sticker albums with rarity and duplicate tracking
- One-time server-verified Master Collector reward
- Idempotent runs, pack openings and payment fulfillment
- Per-player mutation locks and API rate limits
- English and Simplified Chinese interface
- Privacy Policy and Terms of Service

## Coming soon

Peer-to-peer duplicate exchange is **not active**. The Duplicates screen supports server-verified conversion. Peer-to-peer exchange remains unavailable.

## Controlled A2U test

The five-user Test-Pi A2U reward is a controlled developer test, not part of the normal product path. Its card is visible after authentication on the normal Testnet app URL. The owner sees verified A2U payment count, distinct recipient wallet count and the five-wallet threshold status. The status action never creates or submits a payment. Recipient wallets are counted from Pi-verified payment `to_address` values using server-side SHA-256 hashes; legacy completed claims are reconciled through Pi before inclusion. Execution requires the paired Testnet app API key, a dedicated Testnet app-wallet seed and Pi Platform A2U authorization.

Never use a personal wallet passphrase or Mainnet wallet seed.

## Pi integration boundaries

- Pi SDK: `sandbox: true`
- U2A network: `Pi Testnet`
- U2A product: `sticker_bonus_pack_testnet_v1`
- U2A amount: `0.01 Test-Pi`
- Testnet data is not migrated to Mainnet
- Wallet passphrases, private keys and seed phrases are never requested from users

## Required Vercel variables

Core app:

- `PI_API_KEY` — API key belonging only to the paired Testnet app
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Controlled A2U test only:

- `PI_WALLET_PRIVATE_SEED` — dedicated Testnet app-wallet seed; server-only

## Public documents

- Privacy: https://sticker-pi-testnet.vercel.app/privacy.html
- Terms: https://sticker-pi-testnet.vercel.app/terms.html

Daily state resets at `00:00 UTC`; it is not a rolling 24-hour timer.
Daily leaderboard entries are temporary, isolated from Mainnet and contain only each Pioneer’s best verified UTC-day result.

## Pending A2U recovery

Claim creation and blockchain submission intents are persisted before external side effects. A durable app-wide active claim prevents another tester from starting while an outcome is unresolved. Lost creation responses and ongoing payments are reconciled against Pi incomplete server payments, matching the verified UID and exact Testnet reward product. Creation-only intents may retry creation after a successful Pi lookup finds no ongoing payment; Pi ongoing-payment errors are recovered before any submission. Definitive Pi creation rejection codes are persisted and shown without credentials. Submission-uncertain states remain blocked against duplicate transfers. Submitted transactions are completed using their existing txid. Uncertain submissions are never blindly resubmitted; if Pi cannot supply a txid, recovery remains pending and may require administrator investigation. Only definitely unsubmitted duplicate-wallet or over-limit claims are cancelled. Completed wallet/payment metrics remain idempotent. The UI offers Recover pending Test-Pi. No guarantee can remove Pi or blockchain outages.

## Mainnet feature parity (Testnet isolation retained)

The Testnet build now supports two separate 24-sticker albums, duplicate conversion, a 500-gameplay-XP pack meter (up to three per UTC day), and four daily goals with one extra bonus pack per UTC day. Album 2 unlocks after Album 1 is complete; first selection grants one starter pack. Each album completion grants its badge, 250 XP and three packs once. Conversions retain at least one owned copy and cost 4/8/16/24 spare copies by rarity. Packs and run rewards are bound to their album. Existing 4/4 players receive the bonus on their next valid run that day.

Existing `sticker:player:*`, leaderboard and purchase records remain in place. The Testnet challenge namespace, SDK sandbox mode, product, price, credentials and controlled A2U endpoint are preserved. Previous payments without album metadata belong to Album 1. Inventory updates reject stale lock owners; opening and conversion receipts prevent duplicate delivery. No live payment or data reset is performed by tests.

Run `npm test` for UI, API, admin and the existing controlled-A2U mocks. Set `REDIS_TEST_SERVER` to a local redis-server executable for isolated Lua integration tests. Run `npm run check:build` for static syntax checks. Refresh the Testnet app in Pi Browser and verify both albums, the bonus and mobile rankings manually.
