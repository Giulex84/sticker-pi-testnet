# Sticker.pi Testnet

Sticker.pi Testnet is the isolated testing build of the Pi Network collectible skill game.

## Test release

Current release: **v1.0.0**

Testnet URL: https://sticker-pi-testnet.vercel.app

Testnet and Mainnet use separate repositories, Vercel projects, Pi app credentials, payment products and persistent data.

## Active Testnet features

- Pi SDK authentication with `username` and `payments` scopes
- Verified 0.01 Test-Pi User-to-App Bonus Pack purchase
- Server-side payment approval, completion, recovery and validation
- 30-second Sticker Catch challenge
- Server-authoritative XP, levels, daily streaks, quests, packs and inventory
- 24-sticker album with rarity and duplicate tracking
- One-time server-verified Master Collector reward
- Idempotent runs, pack openings and payment fulfillment
- Per-player mutation locks and API rate limits
- English and Simplified Chinese interface
- Privacy Policy and Terms of Service

## Coming soon

Peer-to-peer duplicate exchange is **not active**. The Trade screen is informational and marked “Coming soon”.

## Controlled A2U test

The five-user Test-Pi A2U reward is a controlled developer test, not part of the normal product path. Its card is hidden during ordinary use and is shown only through the explicit `?claim=a2u` test link. Execution requires the paired Testnet app API key, a dedicated Testnet app-wallet seed and Pi Platform A2U authorization.

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
