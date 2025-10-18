## Calibration Pipeline Overview

Eidolon’s calibration flow derives a device-bound PRNU fingerprint that anchors future reality receipts. The pipeline runs entirely on-device and consists of the following stages:

1. **Frame Collection**  
   - Users capture ~30 flat-field frames using the front camera while pointing at a uniform surface.  
   - Users capture ~30 dark frames with the lens covered to measure sensor read noise.  
   - Captures are performed via `expo-camera` (`CameraView`) with processing disabled and reduced quality to keep files lightweight.  
   - Each frame is hashed (SHA-256 of the base64 data), persisted under `expo-file-system/legacy`, and tracked in the calibration session context.

2. **Image Preprocessing** (`src/utils/prnu.ts`)  
   - Frames are decoded to RGBA using `jpeg-js`, then downsampled to a square grayscale matrix (default `64×64`) to reduce computation.  
   - A 3×3 Gaussian blur is applied to produce a low-pass version of the image.  
   - Residuals are computed by subtracting the blur from the original grayscale sample, isolating sensor noise.

3. **Fingerprint Computation**  
   - Residuals are normalised to zero-mean/unit-norm vectors.  
   - Average flat residual and average dark residual are computed separately.  
   - The dark average is subtracted from the flat average to remove bias, producing a raw PRNU estimate that is normalised into the final fingerprint vector.  
   - Per-frame PRNU correlations (dot product with the fingerprint) are recorded for quality diagnostics.

4. **Descriptor & Heatmap**  
   - The fingerprint, along with the flat/dark frame hashes, is hashed again (SHA-256) to form a deterministic fingerprint descriptor.  
   - Residual magnitudes are aggregated into an `8×8` heatmap to visualise spatial energy.  
   - All artefacts (descriptor, vector, heatmap, correlations) are stored via `saveFingerprintRecord` for later verification.

5. **UI Feedback**  
   - The calibration processing screen animates a heatmap using the computed values and shows the average correlation to signal fingerprint quality.  
   - On completion, the app navigates to the main workspace with the fingerprint cached in context.

### Key Files
- `src/screens/calibration/FlatFrameScreen.tsx`, `DarkFrameScreen.tsx` — capture flows.  
- `src/screens/calibration/ProcessingScreen.tsx` — orchestrates PRNU computation + UI.  
- `src/utils/prnu.ts` — decoding, residual extraction, fingerprint math.  
- `src/services/calibrationStorage.ts` — filesystem persistence for frames & fingerprint.  
- `src/context/CalibrationSessionContext.tsx` — shared calibration state.

### Next Steps
- Wire the capture/verification experiences to consume the stored fingerprint, recompute residuals on new captures, and compare against Supabase receipts.  
- Persist additional calibration metadata (camera model, exposure info) for multi-camera support.  
- Implement quality safeguards (correlation thresholds, outlier detection) before committing fingerprints.
