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
- [x] Idempotent run, pack and payment rewards
- [x] Per-player locks and API rate limits
- [x] Incomplete-payment recovery implemented
- [x] Trade marked “Coming soon”
- [x] Controlled A2U card hidden from the normal review path
- [x] Version aligned to `v1.0.0`

## Environment separation

- [x] Testnet SDK uses `sandbox: true`
- [x] U2A payments require `Pi Testnet`
- [x] Testnet product identifier differs from Mainnet
- [x] Testnet and Mainnet repositories and deployments are separate
- [x] Testnet data is not migrated to Mainnet
- [x] No Mainnet wallet secret is required by the Testnet user flow

## Final manual checks

- [ ] Open the latest Testnet production deployment in Pi Browser
- [ ] Confirm footer displays `Sticker.pi Testnet · v1.0.0`
- [ ] Confirm login, one full run, pack opening, Album and Profile
- [ ] Confirm one 0.01 Test-Pi U2A purchase or purchased state
- [ ] Confirm Trade displays “Coming soon”
- [ ] Confirm Privacy and Terms links open
- [ ] Confirm the A2U card is absent without `?claim=a2u`
