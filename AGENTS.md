Eidolon Demo (Hackathon MVP)

Project summary (one-liner)

A mobile-first proof-of-concept that cryptographically anchors captured media to a device-held Ed25519 key, stores signed receipts locally, and syncs those receipts to Supabase for later lookup. Users can capture photos/video, generate a signature sidecar, push receipts to the trust registry, and verify authenticity by querying the database.

⸻

High-level architecture

[Expo Mobile App] <-> HTTPS REST / WebSocket <-> [Supabase (Auth, Postgres) + Storage (S3/MinIO)]
           |                                  \
           |                                   -> [Optional Verifier Service (FastAPI)]
           v
 Local device components:
   - Key store (Ed25519 private key; stored in SecureStore / Keystore)
   - Capture module (camera/audio)
   - Receipt generator (digest builder, signing, sidecar writer)
   - Supabase sync worker (publishes receipts and optional pings)

Components:
	•	Mobile app (Expo React Native) — UI + capture + signing + verification client.
	•	Supabase backend — Auth, device registry (pubkeys), `device_receipt_signatures` table, optional storage for media.
	•	Verifier microservice (optional) — thin service to fetch records from Supabase and run server-side Ed25519.verify for web clients.
	•	Storage — object store for media files or sidecars if we later upload originals.
	•	DevOps — CI for building the Expo app, running tests, and deploying any verifier functions.

⸻

Data & Crypto primitives
	•	Asymmetric keys: Ed25519 (fast, widely supported).
	•	Private key kept on-device only (SecureStore / iOS Keychain / Android Keystore).
	•	Public key uploaded to Supabase registry on device onboarding.
	•	Hashes: SHA-256 for content digests.
	•	Serialization: JSON receipts stored locally; Supabase rows map fields directly.
	•	Signature envelope: `{ digest: sha256(media_bytes), sig: base64(Ed25519(digest)), pubkey: base64(pubkey) }` with extra metadata (dimensions, camera, zoom, etc).
	•	Sidecar: JSON file saved alongside captured media; contains receipt payload + signature + Supabase sync markers.

⸻

Onboarding flow
	1.	Generate keypair
		•	Generate Ed25519 keypair on first run.
		•	Store private key in SecureStore/Keystore; export public key for Supabase registry.
	2.	Device registration
		•	POST /devices to Supabase with `{ device_id, pubkey, device_metadata }`.
		•	Supabase verifies ownership via signed nonce challenge.
		•	Client caches a `registered` flag to skip onboarding next launch.

⸻

Capture / receipt generation flow (per capture)
	1.	Capture media (photo/video) and optional contextual sensors (GPS grid, IMU snapshot).
	2.	Compute SHA-256 digest over the captured bytes.
	3.	Assemble receipt payload:
```
{
  "version": "ReceiptSync-0.2",
  "device_id": "<device_id>",
  "asset_id": "<platform asset identifier>",
  "digest": "<sha256>",
  "media_type": "photo" | "video",
  "signed_at": "2025-10-18T12:34:56Z",
  "byte_length": 1234567,
  "width": 4032,
  "height": 3024,
  "duration": 2.4,             // for video
  "camera_facing": "back",
  "zoom": 0.27,
  "extra": {
    "gps_grid": "SG-XXXXX",
    "source_uri": "file://..."
  }
}
```
	4.	Sign `sha256` (or canonical CBOR/JSON digest) with the device private key.
	5.	Write a JSON sidecar locally: `{ payload, signature, public_key, syncedAt, supabaseId }`.
	6.	Save the media to the device photo library (for demo viewing).

⸻

Supabase sync (device side)
	•	A background action (currently manual via Settings) scans local sidecars.
	•	For each unsigned row, call `device_receipt_signatures.upsert` with payload + signature.
	•	Store `syncedAt` and the returned Supabase row id in the sidecar.
	•	Optional: future work to push media bytes to Supabase Storage keyed by digest.

⸻

Reality pings (optional presence attestations)

On-device:
	•	Periodically build a ping payload (device id, coarse GPS grid, wifi hash, IMU stats).
	•	Sign and POST to `/pings`.

Server:
	•	Stores immutable ping records for later context display.

Verification UI can correlate receipt timestamps with nearby pings to show “presence” evidence.

⸻

Verification flow

Verifier (client or server-side):
	1.	Locate receipt: by scanning Supabase `device_receipt_signatures` with `asset_id`, `digest`, or `device_id + signed_at`.
	2.	Fetch the stored signature payload and associated public key (via `devices` table).
	3.	Recompute SHA-256 over the candidate media (if available) or trust the stored digest.
	4.	Run `Ed25519.verify(signature, digest, pubkey)` for cryptographic integrity.
	5.	Display metadata (timestamp, camera facing, zoom, optional sensors) and highlight whether a matching reality ping exists.
	6.	Mark verdicts:
		•	VERIFIED: signature valid + Supabase row present.
		•	STALE: signature valid but device registry missing (device removed).
		•	UNVERIFIABLE: no matching Supabase row.

⸻

Supabase schema (suggested minimum)

Table: devices
	•	device_id (pk)
	•	pubkey (text)
	•	owner_user_id (fk auth.users or null)
	•	device_model (text)
	•	metadata (jsonb)
	•	registered_at (timestamptz default now())

Table: device_receipt_signatures
	•	asset_id (text pk) — platform asset identifier or generated UUID
	•	device_id (text references devices.device_id)
	•	public_key (text)
	•	digest (text)
	•	signature (text)
	•	media_type (text)         // e.g., 'photo' or 'video'
	•	byte_length (bigint)
	•	signed_at (timestamptz)
	•	camera_facing (text)
	•	zoom (numeric)
	•	width (integer nullable)
	•	height (integer nullable)
	•	duration (numeric nullable)
	•	filename (text nullable)
	•	asset_uri (text nullable)
	•	metadata_path (text nullable)   // device-local reference
	•	extra (jsonb)                   // gps grid, sensor hints
	•	synced_at (timestamptz default now())
	•	created_at / updated_at (timestamptz defaults)

Table: pings (optional)
	•	ping_id (uuid pk)
	•	device_id
	•	ts
	•	payload (jsonb)
	•	signature
	•	created_at

⸻

API endpoints (minimal)

Authentication via Supabase JWT (magic link or passwordless).
	•	POST /api/devices/register — register device; body: `{ device_id, pubkey, device_model }`. Returns nonce.
	•	POST /api/devices/verify — client signs nonce to prove ownership (challenge-response).
	•	POST /api/device-receipt-signatures — upsert signed receipt payload.
	•	GET /api/device-receipt-signatures?device_id=&signed_after= — query receipts.
	•	POST /api/pings — upload signed ping (optional).
	•	GET /api/pings?device_id=&ts_from=&ts_to= — fetch pings around a capture.

Optional verifier API:
	•	POST /api/verify — submit `{ asset_id | digest }` and obtain Supabase-backed verdict.

⸻

Agent Tasks (for coding agent / hackathon squads)

Priority order (fastest to most impactful):
	1.	Infra & Auth (Agent A)
		•	Provision Supabase project (Auth, Postgres).
		•	Create `devices`, `device_receipt_signatures`, optional `pings` tables + policies.
		•	Provide example curl/JWT flows.
	2.	Mobile app skeleton (Agent B)
		•	Expo app with auth placeholder, camera capture, SecureStore key management.
		•	Implement onboarding flow (identity + registry).
		•	Settings screen: device details, reset, “Sync receipts” control.
	3.	Capture & signing (Agent C)
		•	Implement camera UI (front/back toggle, zoom).
		•	Compute SHA-256 digest, sign with Ed25519, write JSON sidecar.
		•	Save asset to media library for demo.
	4.	Supabase sync layer (Agent B/C)
		•	Read local sidecars, upsert into `device_receipt_signatures`.
		•	Track `syncedAt` / Supabase row id in sidecar.
	5.	Verifier experience (Agent D)
		•	Implement screen for selecting a local photo/video, hashing it, querying Supabase by digest, and surface the signature verdict.
		•	Auto-load a thumbnail grid of recent captures with a “Manage access” control for requesting additional library items.
		•	Optional: detect nearby pings and show a timeline.
	6.	Reality pings & notifications (Agent E, optional)
		•	Background task to emit signed pings.
		•	Server policies & minimal visualization.
	7.	Polish & demo (All)
		•	Add share sheet for JSON receipt.
		•	Generate tamper scenarios (altered media without Supabase entry → UNVERIFIABLE).
		•	Prepare slides + live demo script.

⸻

Acceptance criteria & tests
	•	Device registration: agent registers device and proves control via signed nonce.
	•	Capture & sign: capturing a photo/video produces a local sidecar with digest + signature.
	•	Supabase sync: tapping “Sync receipts” uploads new sidecars to `device_receipt_signatures` and marks them synced.
	•	Verify (happy path): selecting the original media file replays the digest lookup against Supabase and verifies the signature.
	•	Verify (missing path): deleting Supabase row → app reports UNVERIFIABLE.
	•	Pings (optional): when a ping exists within ±5s of capture, UI shows presence confirmation.

⸻

Threat model & limitations (be explicit for judges)
	•	Threats addressed:
		•	Forged receipts without access to the device key (signature fails).
		•	Metadata tampering — Supabase row is authoritative and signed.
	•	Not addressed / known weaknesses:
		•	No physical sensor fingerprinting (PRNU). An adversary with device key can sign arbitrary fakes; rely on secure hardware/TEE in production.
		•	No robust detection of benign edits (crop/filter). Verification is binary on digest.
		•	Local sidecars store optional context (GPS) that may leak privacy if synced blindly — keep coarse grids or hashes.

⸻

Implementation shortcuts for 24h hackathon
	•	Use Expo with `expo-camera`, `expo-media-library`, `expo-secure-store`.
	•	Keep receipts as plain JSON (no CBOR). Supabase stores the same shape in jsonb/columns.
	•	Run manual sync from Settings; background tasks optional.
	•	Skip server-side reprocessing — rely on Supabase row + Ed25519.verify in client.
	•	Use Supabase free tier for registry and receipts.

⸻

Example pseudocode (capture → receipt → sync)

```ts
// 1. Capture image bytes -> uri
const photo = await camera.takePictureAsync({ quality: 1, skipProcessing: true });

// 2. Compute digest and sign
const base64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 });
const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
const identity = await ensureIdentity();
const signature = signDigest(digest, identity.privateKey);

// 3. Write sidecar locally
const receipt = {
  assetId: savedAssetId,
  digest,
  signature,
  deviceId: identity.deviceId,
  publicKey: identity.publicKey,
  signedAt: new Date().toISOString(),
  mediaType: "photo",
  byteLength: base64.length * 0.75,
  cameraFacing: facing,
  zoom,
};
await writeReceiptToFile(receipt);

// 4. Sync to Supabase (manual trigger)
await supabase.from("device_receipt_signatures").upsert({
  asset_id: receipt.assetId,
  device_id: receipt.deviceId,
  digest: receipt.digest,
  signature: receipt.signature,
  public_key: receipt.publicKey,
  media_type: receipt.mediaType,
  signed_at: receipt.signedAt,
});
```

⸻

UI demo script (judge-friendly)
	1.	Onboard & register — show key generation, Supabase registry entry, and explain device-level signing.
	2.	Capture photo/video — highlight instant “Signed & saved” status and show JSON sidecar snippet.
	3.	Sync receipts — tap “Sync receipts to Supabase” and display the new row in Supabase dashboard.
	4.	Verify lookup — browse the thumbnail grid, pick the captured media, then watch the app hash it, query Supabase, and run Ed25519 verify to show the verdict.
	5.	Tamper scenario — edit a photo outside the app; note missing Supabase row → UNVERIFIABLE result.
	6.	Show optional reality ping timeline if implemented.
