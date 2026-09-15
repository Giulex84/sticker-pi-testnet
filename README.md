# Sticker.pi Testnet

Public Testnet repository for **Sticker.pi**, a Pi Network social collectible game built around short play sessions, sticker packs, albums, progression, events and safe peer-to-peer trading.

## Product direction

Sticker.pi is designed around a simple loop:

`play → earn → open packs → collect → complete sets → trade duplicates → return tomorrow`

The first Testnet build focuses on a clean mobile-first shell, Pi authentication and the core product structure. Payments, trading settlement and advanced economy features will be introduced only after their flows are fully designed and tested.

## Baseline

- Pi Testnet only
- Pi SDK authentication
- English + Chinese UI foundation
- Mobile-first UX
- Short-session game structure
- Album / packs / trade / profile architecture
- No wallet seed or API secrets in source control
- Separate future Mainnet repository

## Planned sections

- Play
- Album
- Packs
- Trade
- Profile
- Seasonal events and leaderboards

## Deployment

Designed for Vercel. The Pi Developer Portal Testnet app should point only to the dedicated Testnet deployment.
