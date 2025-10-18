# Eidolon Demo App

Hackathon-oriented Expo app that anchors captured media to device-specific entropy and publishes verifiable receipts. This skeleton mirrors the flow described in `docs/AGENTS.md` and wires up navigation scaffolding for the core demo screens.

## Getting Started

- Duplicate `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- `npm install` (already run during scaffolding, rerun if dependencies change).
- `npm run start` to launch Expo CLI, then open on iOS, Android, or web.
- Project uses TypeScript and React Navigation (stack + tabs).
- Grant camera permissions in Expo Go to try the capture + signature flow.

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
- **Identity** — generates/stores device keys with a guided animation (includes reset control).
- **Registry** — syncs the device with Supabase, highlighting RLS requirements and offering a full reset.
- **Capture** — camera experience with digest construction, signature sidecar, and local storage.
- **Verify** — placeholder flow for loading Supabase receipts, checking signatures, and showing verdicts.
- **Settings** — device metadata, receipt sync control, and developer utilities.

## Next Steps

1. Integrate Supabase auth + device registration (challenge-response handshake).
2. Finish receipt sync + verification UI (query by asset id/digest, run Ed25519 verify).
3. Expand capture metadata (GPS grid, IMU stats, manual notes) and store with receipts.
4. Wire verification flow: search Supabase, verify signatures, display pings timeline.
5. Connect periodic “reality pings” and optional Supabase Storage uploads to close the loop.
