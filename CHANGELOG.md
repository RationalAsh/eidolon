# Changelog

## 2024-10-18
- Initialized Expo TypeScript project scaffold and installed React Navigation dependencies.
- Organized project structure under `src/` with stack + tab navigation (`AppNavigator`).
- Added placeholder screens for onboarding, calibration, capture, verification, and settings aligned with the hackathon spec.
- Added `README.md` outlining run steps and roadmap.
- Installed `react-native-gesture-handler` and updated bootstrap sequence (`index.ts`, `App.tsx`) along with Expo-aligned `react-native-screens` / `react-native-safe-area-context` versions to stabilize navigation runtime.
- Renamed the project to **Eidolon** across Expo config, package metadata, and docs.
- Wired Onboarding screen to generate SecureStore-backed Ed25519 keys, surface Supabase configuration, and call the `devices` registry via `@supabase/supabase-js`.
- Added crypto & device helper services, Supabase client wrapper, and supporting Expo modules (SecureStore, Crypto, Device) plus custom type declarations.
- Updated documentation (`README.md`, `.env.example`) and TypeScript config to cover environment setup and third-party typings.
- Replaced legacy SecureStore key names with underscore-based variants to satisfy platform constraints during onboarding.
- Added Supabase RLS guidance and surfaced policy error messaging when device upsert is blocked.
- Split onboarding into dedicated intro, identity, and registry screens with animated flows and updated navigation.
- Added reusable "Reset onboarding state" controls (local + Supabase cleanup) to identity and registry screens plus shared confirmation hook.
- Replaced calibration placeholder with a three-step navigator (flat frames, dark frames, animated residual processing) wired to Expo Camera, persisted hashes, and an animated heatmap preview.
