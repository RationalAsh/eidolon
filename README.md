# EntropyCam Expo App

Hackathon-oriented Expo app that anchors captured media to device-specific entropy and publishes verifiable receipts. This skeleton mirrors the flow described in `docs/AGENTS.md` and wires up navigation scaffolding for the core demo screens.

## Getting Started

- `npm install` (already run during scaffolding, rerun if dependencies change).
- `npm run start` to launch Expo CLI, then open on iOS, Android, or web.
- Project uses TypeScript and React Navigation (stack + tabs).

## Screen Outline

- **Onboarding** — describes the end-to-end flow and kicks off calibration.
- **Calibration** — checklist for collecting flat/dark frames and deriving PRNU.
- **Capture** — placeholder notes for camera integration, digest construction, and uploads.
- **Verify** — placeholder flow for loading sidecars, recomputing residuals, and showing verdicts.
- **Settings** — hooks for device metadata, ping configuration, and developer utilities.

## Next Steps

1. Integrate Supabase auth + device registration (challenge-response handshake).
2. Implement calibration pipeline (frame capture, residual extraction, PRNU descriptor).
3. Add capture UI with expo-camera, sensor sampling, and receipt generation.
4. Wire verification flow: pull receipt by hash, recompute metrics, display verdict + ping timeline.
5. Connect periodic “reality pings” and Supabase Storage uploads to close the loop.
