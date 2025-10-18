# Eidolon Demo App

Hackathon-oriented Expo app that anchors captured media to device-specific entropy and publishes verifiable receipts. This skeleton mirrors the flow described in `docs/AGENTS.md` and wires up navigation scaffolding for the core demo screens.

## Getting Started

- Duplicate `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- `npm install` (already run during scaffolding, rerun if dependencies change).
- `npm run start` to launch Expo CLI, then open on iOS, Android, or web.
- Project uses TypeScript and React Navigation (stack + tabs).

### Supabase Setup

With row-level security enabled, allow the anon key to insert into the `devices` table for the hackathon demo:

```sql
-- Supabase SQL editor
alter table devices enable row level security;

create policy "Allow anon device upserts"
  on devices
  for insert
  with check (true);

create policy "Allow anon device select"
  on devices
  for select
  using (true);
```

Adjust the policies as you progress toward authenticated flows.

## Screen Outline

- **Intro** — brand splash (Eidolon, tagline, logo) with CTA into onboarding.
- **Identity** — generates/stores device keys with a guided animation.
- **Registry** — syncs the device with Supabase, highlighting RLS requirements.
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
