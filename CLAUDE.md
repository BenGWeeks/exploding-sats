# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Way of the Exploding Sats is a browser tribute to the 1985 C64 karate game "The Way of the Exploding Fist", built with React, TypeScript and Nostr integration. Players pay 21 sats via Lightning to fight, with scores published to Nostr for a decentralized leaderboard. It shares its stack and payment/leaderboard code with Space Zappers (spacezappers.com).

## Tech Stack

- **React 18** + **TypeScript** + **Vite**
- **TailwindCSS 3** + **shadcn/ui** (Radix-based components)
- **Nostrify** for Nostr protocol integration
- **TanStack Query** for data fetching/caching
- **Lightning payments** via LNURL-pay invoice generation + LNbits payment polling

## Commands

```bash
npm run dev      # Start game (8088) + score service (8089) concurrently
npm run build    # Production build (outputs to dist/)
npm run test     # Full validation: TypeScript check, ESLint, Vitest, then build
```

### Local Development Setup
1. `.env.local` (git-ignored) holds the score service key:
   ```
   GAME_NSEC=nsec1...
   VITE_GAME_PUBKEY=<64-char-hex-pubkey>
   ```
2. `.env` (git-ignored) holds the Lightning configuration - see `.env.example`.
3. Run `npm run dev` and open http://localhost:8088

Always run `npm run test` after making changes.

## Architecture

### Game
- `src/lib/fistEngine.ts` - pure, deterministic rules engine stepped at 60 Hz. Move table (`MOVES`), the C64 control chart (`moveForInput`), hit judging, knockdowns, bout/grade progression, CPU AI (`aiProfile`, `cpuInput`), bull bonus round and the attract-mode demo. Emits `GameEvent`s for audio/UI.
- `src/lib/fighterPoses.ts` - fighters are articulated skeletons; each move is a list of key poses interpolated by progress.
- `src/lib/fistRenderer.ts` - draws the 320x200 world in the C64 palette: four cached arenas, the sensei judge, fighters, bull and HUD icons. `hudTexts` returns the HUD text layout.
- `src/components/FistCanvas.tsx` - renders the world offscreen and scales it 3x with pixel snapping, drawing HUD text on top. Reads engine state from a ref every frame (no React re-render per frame).
- `src/lib/fistAudio.ts` - Web Audio synthesis: kiai, crack, thud, block, points, music.
- `src/pages/Game.tsx` - game loop (fixed step), keyboard/gamepad/touch input, payment flow, leaderboard, share, dialogs.
- `src/components/JoystickControls.tsx` - touch joystick + fire.

### Nostr Integration (shared with Space Zappers)
- `src/components/NostrProvider.tsx`, `src/hooks/useNostrPublish.ts`
- `src/hooks/useGameScores.ts` - leaderboard query (kind 30762 by game pubkey), `GAME_ID = 'exploding-sats'`
- `src/components/LeaderboardEntry.tsx` - shows player name and grade
- `score-service/index.js` - signs kind 30762 with `GAME_NSEC`. `level` = grade index (0 = Novice)

### Lightning Payment Flow
1. "Pay 21 sats" -> `useLNbitsPayment` resolves `VITE_LIGHTNING_ADDRESS` via LNURL-pay and fetches an invoice
2. Payment hash is extracted from the bolt11 and LNbits (`VITE_LNBITS_URL` + `VITE_LNBITS_INVOICE_KEY`) is polled every 2s
3. On paid, the match starts. NWC and WebLN wallets pay in one click.

### Provider Hierarchy (App.tsx)
QueryClientProvider -> AppProvider -> NostrProvider -> NWCProvider -> UnheadProvider

## Game Rules (keep faithful to the C64 original)
- Direction alone: walk, jump, crouch, high punch (up-fwd), jab punch (down-fwd), low punch (crouch then fwd), forward somersault (up-back), backward somersault (down-back). Holding back blocks automatically.
- Direction + fire: flying kick (up), high kick (up-fwd), mid kick (fwd), jab kick (down-fwd), forward sweep (down), backward sweep (down-back), roundhouse (back, hold fire; release early = about-face), high back kick (up-back).
- Every landed blow knocks the opponent down; full point for a clean hit, half for a poor one. First to 2 full points wins the bout. 30 second clock; judge decides on time-out. Time bonus 100/sec.
- Two bouts per grade; promotion after winning both; a lost bout ends the match. Four arenas cycle; bull bonus after the fourth. 2-player: four bouts, highest total wins.

## Testing
- Vitest with jsdom. Engine tests in `src/lib/fistEngine.test.ts` cover the control chart, hits, blocks, evasions, knockdown reset, bout/grade flow and the bull.
- Wrap components in `TestApp` for required providers.

## Production
- **Site**: https://explodingsats.com (domain suggested; not yet registered)
- **Local dev**: http://localhost:8088
- **Container**: http://localhost:3004

### Docker Deployment (black-panther)

**IMPORTANT**: Do NOT deploy to production unless the user explicitly asks. Test on localhost:8088 first.

The container is defined in `/home/benweeks/GitHub/black-panther/apps-stack/docker-compose.yml` (service `exploding-sats`, port 3004). It needs `EXPLODING_SATS_GAME_NSEC` and `EXPLODING_SATS_LNBITS_INVOICE_KEY` in `apps-stack/.env`.

```bash
cd /home/benweeks/GitHub/black-panther/apps-stack
docker compose build exploding-sats
docker compose up -d exploding-sats
docker logs exploding-sats --tail 5          # "Score service listening on port 3002"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004
```

Then add a proxy host in nginx-proxy-manager (port 81) for the domain pointing at `exploding-sats:80`.

## Icon Generation

```bash
npx resvg-cli --fit-width 180 --fit-height 180 public/favicon.svg public/apple-touch-icon.png
```

## Important Notes

- Read AGENTS.md for Nostr integration patterns; NIP.md for the score event spec
- Game costs 21 sats (free mode available for testing; free-play scores are not publishable)
- Document end-user problems and solutions in docs/TROUBLESHOOTING.adoc (single table)
- `DialogContent` requires a `DialogTitle` for accessibility
- Always check the GitHub Actions run after pushing
