# Sticker.pi — Pi Review Checklist

## Testnet status

- [x] Pi Testnet app created
- [x] Development URL configured
- [x] Domain ownership validated
- [x] PiNet subdomain configured
- [x] Pi SDK authentication working
- [x] User-to-App Test-Pi payment completed successfully
- [x] Payment amount, network, user, memo and metadata validated server-side
- [x] Privacy Policy available
- [x] Terms of Service available
- [x] English / Chinese UI foundation
- [x] Playable core loop available
- [x] Server-authoritative player state and UTC daily reset
- [x] Server-issued run identifiers and plausible-result checks
- [x] Idempotent run, pack and payment rewards
- [x] Per-player mutation lock and API rate limits
- [x] Payment recovery callback tested
- [x] One-time server-verified 24/24 Master Collector reward

## Before Mainnet repository is created

- [x] Enable persistent server storage
- [x] Make rewards and progression server-authoritative
- [x] Add baseline request throttling / anti-abuse controls
- [ ] Add safe trade matching with server-side ownership checks
- [ ] Add seasonal collection and leaderboard rules
- [ ] Audit every Testnet-only constant and switch Mainnet SDK to `sandbox:false`
- [ ] Use separate Mainnet Pi API credentials
- [ ] Re-run U2A payment verification on Mainnet
- [ ] Re-review Privacy and Terms for the Mainnet economy
- [ ] Prepare Ecosystem Listing assets and screenshots

## A2U

A2U is not treated as a domain-claim shortcut. It should only be enabled when current Pi platform support permits it and Sticker.pi has a real, bounded reward use case with persistent state, cooldowns and abuse protection.

## Reviewer path

1. Open Sticker.pi in Pi Browser.
2. Authenticate using Pi.
3. Start Sticker Catch and finish a 30-second run.
4. Earn XP; score 25+ to receive the once-per-UTC-day gameplay pack.
5. Open a pack and view the Album.
6. Review duplicate tracking in Trade.
7. Optionally purchase the 0.01 Test-Pi bonus pack.
8. Open Profile to see progression statistics.

## Release candidate gates

- [x] 0.01 Test-Pi purchase grants exactly one server-side pack
- [x] Pack reveal updates XP, collection and duplicates server-side
- [x] English and Simplified Chinese core flows checked on Pi Browser
- [ ] Verify UTC reset and streak increment across a real day boundary
- [ ] Re-test one complete run after the v1.0-rc.2 run-verification adjustment
- [ ] Freeze the accepted commit before creating the separate Mainnet repository
