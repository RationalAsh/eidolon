# Changelog

## 2024-10-19
- Disabled the calibration navigator and rerouted onboarding so registered devices land directly on the main tabs.
- Added an intro-screen status check that auto-skips onboarding when identity + registry state already exist.
- Replaced the settings placeholder with live device identity details and a confirmation-gated onboarding reset control.
- Delivered the capture UI with Expo Camera support, zoom + facing toggles, signature-aware metadata sidecars, and local media-library persistence for photos and videos.
- Updated capture dependencies (expo-media-library ~18.2.0, @react-native-community/slider ~5.0.1) and moved to safe-area/legacy filesystem APIs to resolve capture-time deprecation failures.
- Normalized capture metadata filenames so iOS asset identifiers with path separators save signatures reliably.
- Added Supabase sync for local signature receipts (new `device_receipt_signatures` table + Settings button to upload sidecars).
- Retired the PRNU/calibration pipeline and removed related code to focus on Supabase-backed signature lookup.

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
- Replaced calibration placeholder with a three-step navigator (flat frames, dark frames, animated residual processing) wired to Expo Camera, PRNU residual math, and persisted fingerprint artifacts with animated heatmap.
