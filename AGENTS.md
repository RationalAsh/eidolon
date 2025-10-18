EntropyCam / Reality-Pings Demo (Hackathon MVP)

Project summary (one-liner)

A mobile-first proof-of-concept that cryptographically anchors media to device-specific sensor noise + ephemeral entropy and publishes verifiable receipts to a trust registry (Supabase). Users can capture media (photo/audio/text), produce a signed receipt, send reality pings, and later verify whether a chosen media item is authentic for this device+moment.

⸻

High-level architecture

[Expo Mobile App] <-> HTTPS REST / WebSocket <-> [Supabase (Auth, Postgres) + Storage (S3/MinIO)]
           |                                  \
           |                                   -> [Optional Verifier Service (FastAPI)] 
           v
 Local device components:
   - Key store (Ed25519 private key; stored in SecureStore / Keystore)
   - PRNU module (calibration + residual extraction)
   - Capture module (camera/audio)
   - Receipt generator (digest builder, signing, sidecar writer)

Components:
	•	Mobile app (Expo React Native) — UI + capture + signing + verification client.
	•	Supabase backend — Auth, device registry (pubkeys), receipts table, storage of sidecars, optional CDN for media.
	•	Verifier microservice (optional) — stateless service to recompute residuals, validate receipts and return human-friendly verdicts (can be serverless / Cloud Function).
	•	Storage — object store for media files and sidecars (Supabase Storage or S3/MinIO).
	•	DevOps — CI for building app, running tests, and deploying verifier.

⸻

Data & Crypto primitives
	•	Asymmetric keys: Ed25519 (fast, widely supported).
	•	Private key kept on-device only (SecureStore / iOS Keychain / Android Keystore).
	•	Public key uploaded to Supabase registry on device onboarding.
	•	Key derivation / fingerprints: HKDF-SHA256 used to derive ephemeral seeds from residual data when needed.
	•	Hashes: SHA-256 for content digests.
	•	Serialization: CBOR for compact binary receipts; JSON for human readability / debugging.
	•	Signature envelope: { digest: bytes(CBOR), sig: base64(Ed25519(digest)), pubkey: base58(pubkey) }
	•	Sidecar: JSON or XMP embedded file that contains receipt, PRNU metadata, and verification hints. Default: JSON sidecar stored alongside media in storage.

⸻

Onboarding / calibration process
	1.	Generate keypair
	•	Generate Ed25519 keypair on first run.
	•	Store private key in SecureStore/Keystore; export public key for Supabase registry.
	2.	Device registration
	•	POST /devices to Supabase with { device_id, pubkey, device_metadata }.
	•	Supabase verifies ownership by challenging the client to sign a nonce and return the signed nonce.
	3.	PRNU calibration (sensor fingerprint extraction)
	•	User is guided to:
	•	Capture N flat frames: point camera at evenly-lit white surface (e.g., white paper) for M frames (e.g., 30–50).
	•	Capture N dark frames: cover lens to capture dark-current/read-noise for M frames (e.g., 30).
	•	On-device compute:
	•	median_flat = median(frames_flat)
	•	median_dark = median(frames_dark)
	•	K_raw = (median_flat - gaussian_blur(median_flat))  (approx PRNU estimate)
	•	Normalize and quantize: K = normalize(K_raw) (store as float32 array or compressed PNG).
	•	Store K locally only (private), and publish a public fingerprint descriptor (hashed summary, not raw K) to Supabase for later verification:
	•	fingerprint_descriptor = sha256(cbor({ sensor_model, image_size, hash_stats_of_K }))
	•	Save calibration metadata in SecureStore.

Notes:
	•	If RAW capture available: prefer RAW frames. For hackathon, high-quality JPEG is okay.

⸻

Capture / receipt generation flow (per capture)
	1.	Capture I (photo or audio frame(s)) and gather optional sensors: IMU burst (100–500ms), GPS (coarse), ambient audio snippet (1s).
	2.	Compute image residual R:
	•	I_lp = gaussian_blur(I, kernel=5)
	•	R = I - I_lp
	•	Optionally run wavelet/high-pass or use a small CNN residual extractor when available.
	3.	Compute PRNU correlation:
	•	corr = normalized_cross_correlation(R, K) for same resolution patches or multi-scale patch correlation.
	4.	Compute ephemeral entropy features:
	•	Residual histogram entropy H
	•	DCT mid/high-band energy vector DCT_sketch = topN_quantized_bins(dct(R))
	•	Rolling-shutter line variance (for video) RS_var
	•	IMU micro-vibration stats if available: mean/std/kurtosis
	5.	Build digest_payload (CBOR):

{
  "version": "EntropyCam-0.1",
  "img_hash": "sha256(bytes_of_I)",
  "device_id": "<device_id>",
  "ts": "2025-10-18T12:34:56Z",
  "img_w": 4032,
  "img_h": 3024,
  "prnu_corr": 0.037,
  "r_entropy": 7.34,
  "dct_sketch": [123,45,67,...],          // quantized ints
  "imu_sketch": { "var": 0.002, "kurt": 2.1 },
  "gps_grid": "SG-XXXXX",                 // coarse grid ID (optional)
  "orig_format": "jpeg",
  "extra": { ... }                        // optional metadata
}

	6.	digest = CBOR.encode(digest_payload)
sig = Ed25519.sign(digest, privkey)
receipt = { digest, sig } (store both as sidecar JSON + upload to registry)
	7.	Optionally embed a low-strength spread-spectrum watermark back into the image (derived from HKDF(digest)) to increase robustness; store watermark parameters in sidecar.

Store/upload:
	•	Store original media in Storage at s3://bucket/media/<sha256>.jpg
	•	Store sidecar at s3://bucket/sidecars/<sha256>.json and insert a row into receipts table: {sha256, device_id, pubkey, ts, sig, digest_path, media_path}

⸻

Reality pings (server-verified assertions)

Purpose: produce short, frequent signed attestations of device state that can act as “proof-of-presence/time” anchors separate from any single media capture.

On-device:
	•	Every N seconds/minutes (user-configurable) create a ping:

{
  "type": "ping",
  "device_id": "...",
  "ts": "2025-10-18T12:35:00Z",
  "gps_grid": "SG-XXXXX",
  "wifi_hash": sha256(sorted_wifi_ssids),
  "imu_stats": { ... },
  "nonce": random_32_bytes()
}

	•	CBOR-encode, sign with Ed25519.
	•	POST /pings to Supabase (or verifier service) with {pubkey, cbordata, sig}

Server:
	•	Stores pings in pings table as immutable records; optionally run lightweight checks (GPS plausibility, duplicate detection).
	•	Returns ping_id receipt ping://<id> which can be referenced by media receipts to show presence evidence near capture time.

Use in verification:
	•	For a media receipt with timestamp ts, verifier fetches pings with ts +/- delta and shows whether a matching ping exists for that device and coarse location.

Privacy note: GPS can be coarse (grid-level) to avoid leaking precise location; use hashed or truncated coordinates.

⸻

Verification flow

Verifier (client or server-side) steps when user selects a media file:
	1.	Compute sha256(media_bytes) → lookup receipts table or sidecar.
	2.	Pull receipt and pubkey from registry.
	3.	Verify signature: Ed25519.verify(sig, digest, pubkey) → cryptographic integrity.
	4.	Recompute physical features from the media:
	•	Recompute R, prnu_corr, r_entropy, dct_sketch.
	•	If watermark present: try to detect the spread-spectrum watermark derived from digest.
	5.	Compare recomputed metrics to values in digest_payload:
	•	Use pre-defined thresholds and an aggregation score S.
	•	Example rule-of-thumb thresholds (tunable through ROC during dev):
	•	prnu_corr match within ±0.01
	•	r_entropy within ±10%
	•	dct_sketch Hamming distance ≤ K
	•	Output verdict:
	•	VERIFIED: signature valid + physical metrics within thresholds (+ping present)
	•	SUSPECT: signature valid but physical metrics drift (possible benign transform)
	•	FORGED: signature invalid OR physical metrics impossible (zero corr + high mismatch)
	•	UNVERIFIABLE: no signature/sidecar
	6.	Display a human-friendly UI with:
	•	Crypto badge (green/yellow/red)
	•	PRNU correlation graph (histogram)
	•	Nearby reality-ping timeline (if any)
	•	Raw receipt JSON for advanced users

⸻

Supabase schema (suggested)

Table: devices
	•	device_id (pk)
	•	pubkey (text)
	•	owner_user_id (fk auth.users)
	•	device_model (text)
	•	fingerprint_descriptor (text)
	•	calibrated_at (timestamp)
	•	metadata (jsonb)

Table: receipts
	•	media_hash (pk sha256)
	•	device_id
	•	ts
	•	sig (text/base64)
	•	digest_path (storage path)
	•	media_path (storage path)
	•	verdict (enum nullable)
	•	created_at

Table: pings
	•	ping_id (uuid pk)
	•	device_id
	•	ts
	•	payload (jsonb)
	•	sig
	•	created_at

Storage: media and sidecars.

⸻

API endpoints (minimal)

Authentication via Supabase JWT (user sign-in with email or magic link).
	•	POST /api/devices/register — register device; body: {device_id, pubkey, device_model}. Returns nonce.
	•	POST /api/devices/verify — client signs nonce to prove ownership (challenge-response).
	•	POST /api/calibration/upload — upload calibration descriptor (public summary).
	•	POST /api/media/upload — uploads media; returns media_hash.
	•	POST /api/receipts — attach receipt: {media_hash, digest_cbor(base64), sig, device_id}
	•	GET /api/receipts/:media_hash — fetch receipt + verdict
	•	POST /api/pings — upload signed ping
	•	GET /api/pings?device_id=&ts_from=&ts_to= — query pings

Optional verifier:
	•	POST /api/verify — provide media bytes; server recomputes residual and returns verdict (useful for web demo)

⸻

Agent Tasks (for coding agent / hackathon squads)

Priority order (fastest to most impactful):
	1.	Infra & Auth (Agent A)
	•	Provision Supabase project (Auth, Postgres, Storage). Create DB schema.
	•	Implement device registration endpoints (challenge-response).
	•	Provide example curl/JWT flows.
	2.	Mobile app skeleton (Agent B)
	•	Expo app with auth, camera capture (expo-camera), file picker, and SecureStore.
	•	Implement keypair generation + secure save, device register flow.
	•	UI screens: Onboarding+Cali­bration, Capture, Verify, Settings.
	3.	PRNU & residual module (Agent C)
	•	Implement residual extraction pipeline in JS (pure JS / WASM) or call a lightweight server endpoint.
	•	Calibration flow to compute K (store locally).
	•	Compute corr, H, DCT_sketch functions.
	•	Unit tests with synthetic images (add noise, compress, crop).
	4.	Receipt & sidecar module (Agent B/C)
	•	Build digest payload, CBOR encode (use cbor lib), sign with Ed25519 (tweetnacl), store sidecar JSON + upload.
	5.	Reality ping & witness mesh (Agent D)
	•	Implement ping generation (coarse GPS grid), periodic sender, and server storage.
	•	Optional: local peer exchange (Bluetooth / mDNS) for co-witness attestations.
	6.	Verifier service + UI (Agent E)
	•	Serverless function to verify receipts (signature + recompute residuals) and return verdict.
	•	UI for viewing verdict and pings timeline.
	7.	Polish & Demo (All)
	•	Tamper experiments lines: show benign transforms vs adversarial attempts.
	•	Prepare slides + live demo script.

⸻

Acceptance criteria & tests
	•	Device register: Agent can register a device and prove control via signed nonce.
	•	Calibration: App computes PRNU descriptor from 30 flat + 30 dark frames and stores local K.
	•	Signed capture: Capture a photo → app produces a receipt, signs digest, uploads both to Supabase; receipts table shows entry.
	•	Verify (happy path): Recompute residual on-device or server → signature verifies and PRNU correlation within threshold → UI shows VERIFIED.
	•	Verify (tamper path): After editing (crop + denoise), signature still valid but PRNU correlation drops → UI shows SUSPECT.
	•	Verify (forged path): Try to take unrelated image and attach a different device’s receipt → signature invalid or PRNU mismatch → UI shows FORGED.
	•	Ping presence: When a ping exists within ±5s of a capture ts and grid matches, the UI shows a “presence” confirmation.

⸻

Threat model & limitations (be explicit for judges)
	•	Threats addressed:
	•	Casual forgeries and innocent re-encodings (most benign edits).
	•	Non-adversarial metadata stripping.
	•	Not addressed / known weaknesses:
	•	An adversary who compromises private key can sign arbitrary fakes — mitigation: use secure hardware-backed keystore (Secure Enclave) in production.
	•	A strong adversary with many images of the device can attempt fingerprint extraction and re-embedding (PRNU transplant). Mitigations: fragile fingerprint design, watermarking, multimodal checks (IMU/audio/pings).
	•	Heavy denoising / generative post-processing can reduce residuals — mitigations: watermark + DCT midband sketch + cross-modal checks.
	•	Social platforms recompress and strip metadata — store receipts and sidecars on your registry (server) and link by sha256(media) so you can still verify when the original file is available.

⸻

Implementation shortcuts for 24h hackathon (practical choices)
	•	Use Expo with expo-camera (no native modules) and expo-secure-store for keys.
	•	Implement residual extraction in JS using ndarray + simple convolution (don’t try BM3D or heavy denoisers).
	•	Use tweetnacl or libsodium.js for Ed25519.
	•	Use Supabase free tier for registry and storage.
	•	Skip server-side heavy recomputation — do on-device for demo; add server verifier later if time.
	•	For watermarking, use a simple DCT mid-band additive watermark (low amplitude) using js-dct libs.
	•	Default thresholds can be tuned live by capturing baseline images and running tests.

⸻

Example pseudocode (capture -> receipt)

// 1. Capture image bytes -> I
const imgBytes = await camera.takePictureAsync({ quality: 0.9 });

// 2. Compute residual R
const I = decodeImage(imgBytes); // float32 array, grayscale
const I_lp = gaussianBlur(I, 5);
const R = subtract(I, I_lp);

// 3. Compute prnu_corr
const K = loadLocalPRNU(); // float32 same size or multi-scale
const corr = normalizedCrossCorrelation(R, K);

// 4. Compute entropy and DCT sketch
const H = shannonEntropy(R);
const dctVec = topNDCTbins(R, N=64); // quantize to ints

// 5. Build digest and sign
const payload = { version: "EntropyCam-0.1", ts: nowISO(), img_hash: sha256(imgBytes), prnu_corr: corr, r_entropy: H, dct_sketch: dctVec };
const digest = CBOR.encode(payload);
const sig = ed25519_sign(digest, privateKey);

// 6. Save sidecar and upload
const mediaHash = sha256(imgBytes);
uploadToStorage(`/media/${mediaHash}.jpg`, imgBytes);
uploadToStorage(`/sidecars/${mediaHash}.json`, JSON.stringify({ payload, sig, pubkey }));
await fetch("/api/receipts", { method:"POST", body: JSON.stringify({ media_hash: mediaHash, digest: base64(digest), sig, device_id }) });


⸻

UI demo script (judge-friendly)
	1.	Onboard & calibrate — show “PRNU fingerprint recorded”.
	2.	Take a live photo — app shows green “VERIFIED” badge after signing and uploading.
	3.	Tamper the saved photo externally (crop + denoise) and re-run verification → shows SUSPECT (explain thresholds).
	4.	Take another photo from a different device and try to load the first device’s receipt → shows FORGED.
	5.	Show ping timeline and demonstrate verifying capture has matching pings ±5s (presence evidence).
	6.	Show raw receipt JSON and how Ed25519.verify is performed.

⸻