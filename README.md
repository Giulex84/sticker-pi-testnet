# Sticker.pi Testnet

Sticker.pi is a Pi Network social collectible game designed for short, repeatable sessions and long-term collection goals.

## Core loop

`play → earn XP/packs → open packs → collect → complete sets → trade duplicates → return tomorrow`

The Testnet build is intentionally focused on retention, social collectability and safe Pi integration before any Mainnet economy is introduced.

## Current Testnet features

- Pi SDK authentication (`username` + `payments`)
- Verified User-to-App Test-Pi purchase flow
- Server-side payment validation and completion
- Playable 30-second skill-based **Sticker Catch** daily challenge
- XP, levels and daily streaks
- 24-sticker collection with rarity tiers
- Pack opening with duplicates tracked for future trading
- Server-verified UTC daily quests and streaks
- Profile statistics and progression
- English and Simplified Chinese UI foundation
- Responsive mobile-first interface
- Privacy and Terms pages
- Authoritative player state through Upstash Redis REST
- Idempotent run, pack-opening and paid-pack rewards

## Product baseline

Sticker.pi should keep the strongest patterns observed in high-engagement Pi ecosystem apps while remaining original:

1. Fast onboarding through Pi identity.
2. Immediate action after login; no empty dashboard.
3. Short sessions that feel rewarding in under one minute.
4. A reason to return every day: streaks, quests and limited progression.
5. Visible collection progress and rarity.
6. Duplicate items that create future social/trading utility.
7. Seasonal progression, leaderboards and community drops.
8. Mobile-first UI with strong visual feedback.
9. Internationalization from the start; English and Chinese first, with additional locale files planned.
10. Pi payments tied to clear in-app utility rather than speculative promises.

## Storage

Persistent server storage is required for gameplay rewards. Configure on Vercel:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Local storage is only a display cache. XP, packs, inventory, daily progress and payment entitlements are awarded by authenticated server actions.

## Mainnet policy

Testnet and Mainnet remain separate deployments and repositories. Mainnet will use `sandbox:false`, Mainnet-specific credentials and a fresh payment/security review.

A2U is **not** required simply to associate the future `sticker.pi` domain. A2U rewards, if enabled later, must have real product utility, anti-abuse limits and current Pi platform support. They will not be added merely to satisfy a checklist.

## Planned milestones

- Stronger challenge telemetry and adaptive anti-cheat limits
- Safer duplicate exchange/matching
- Seasonal collections and leaderboard
- Limited community sticker drops
- More languages (planned architecture: English, Chinese, then additional locales based on user demand)
- Mainnet hardening and separate Mainnet deployment

## Deployment

Hosted on Vercel. The Pi Developer Portal Testnet app must point only to the dedicated Testnet deployment.
