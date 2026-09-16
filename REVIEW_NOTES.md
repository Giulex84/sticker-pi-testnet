# Sticker.pi Testnet — Reviewer Notes

## Purpose

Sticker.pi is a short-session skill game and collectible album for Pi users. Players complete a 30-second Sticker Catch challenge, earn XP and a limited daily pack, open three-sticker packs, and build a 24-sticker collection. Duplicate trading is visibly marked as a future feature and is not active.

## Recommended review path

1. Open the app in Pi Browser and authenticate with Pi.
2. Start Sticker Catch and complete one 30-second run.
3. Review the resulting score, accuracy, combo, XP and daily quest progress.
4. A score of 25 or higher grants at most one gameplay pack per UTC day.
5. Open a pack and review the progressive reveal, rarity, NEW/DUPLICATE state and Album update.
6. Open Trade to confirm that duplicates are tracked without enabling peer-to-peer transfers.
7. Optionally purchase the 0.01 Test-Pi Bonus Pack and open it.
8. Close and reopen the app to verify server-side persistence.
9. Switch between English and Simplified Chinese.

## Security and persistence

- Pi access tokens are verified server-side through `/v2/me`.
- Important state is authoritative in Upstash Redis; local storage is only a display cache.
- Runs require a short-lived server-issued identifier and undergo duration and plausibility checks.
- Player mutations are serialized with a per-player Redis lock.
- Run rewards, pack openings and paid-pack grants are idempotent.
- Payment amount, direction, network, user, memo, metadata, transaction and final Pi status are validated server-side.
- Sensitive credentials are Vercel environment variables and are not present in the repository or browser bundle.

## Intentional limitations

- This is a Pi Testnet build and uses `sandbox: true` and Test-Pi only.
- Peer-to-peer trading, A2U rewards, leaderboards and Mainnet monetization are not active.
- Emoji artwork is temporary Testnet artwork and will be replaced with original production assets before a polished Mainnet launch.

## Reset rules

Daily quests and the daily gameplay-pack limit reset at `00:00 UTC`. Streak progression is calculated from server UTC dates, not from the device clock.
