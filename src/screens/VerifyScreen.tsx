import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  computeDigestForFile,
  fetchDeviceRecord,
  fetchSupabaseReceipts,
  formatVerdictMessage,
  locateBestLocalReceipt,
  loadLocalReceipts,
  SupabaseDeviceRow,
  SupabaseReceiptRow,
  verifySignatureWithFile,
} from "../services/verification";
import type { CaptureReceipt } from "../types/capture";

type AssetSummary = {
  id: string;
  filename: string;
  mediaType: "photo" | "video";
  duration?: number | null;
  createdAt?: string | null;
  thumbnailUri: string | null;
};

type SelectedAssetDetails = {
  summary: AssetSummary;
  uri: string;
  byteLength: number | null;
};

type VerificationVerdictLabel =
  | "VERIFIED"
  | "STALE"
  | "SIGNATURE_INVALID"
  | "DIGEST_MISMATCH";

type VerificationState =
  | { status: "idle" }
  | { status: "loading"; label: string }
  | { status: "not_found"; digest: string }
  | {
      status: "verified";
      digest: string;
      receipt: SupabaseReceiptRow;
      deviceRecord: SupabaseDeviceRow | null;
      digestMatches: boolean;
      signatureValid: boolean;
      verdict: VerificationVerdictLabel;
      message: string;
      matches: number;
    }
  | { status: "error"; message: string };

const formatBytes = (bytes: number | null | undefined) => {
  if (!bytes || bytes <= 0) {
    return "Unknown size";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
};

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return "Unknown";
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return value;
  }
  return dt.toLocaleString();
};

const formatCreationTime = (value: string | null | undefined) => {
  if (!value) {
    return "Unknown";
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return "Unknown";
  }
  return dt.toLocaleString();
};

const toAssetSummary = (
  asset: MediaLibrary.Asset,
  previewUri: string | null
): AssetSummary => {
  const mediaType =
    asset.mediaType === MediaLibrary.MediaType.video ? "video" : "photo";
  return {
    id: asset.id,
    filename: asset.filename ?? asset.id,
    mediaType,
    duration: asset.duration ?? null,
    createdAt: asset.creationTime ? new Date(asset.creationTime * 1000).toISOString() : null,
    thumbnailUri: previewUri,
  };
};

type PermissionDetails = MediaLibrary.PermissionResponse & {
  accessPrivileges?: "all" | "limited" | "none";
};

const hasLibraryAccess = (perm: PermissionDetails) =>
  perm.granted || perm.accessPrivileges === "limited";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const buildAssetIdCandidates = (assetId: string): string[] => {
  const candidates = new Set<string>();
  if (assetId) {
    candidates.add(assetId);
    const withoutScheme = assetId.replace(/^ph:\/\//i, "");
    candidates.add(withoutScheme);
    if (assetId.includes("/")) {
      const firstSegment = assetId.split("/")[0];
      if (firstSegment) {
        candidates.add(firstSegment);
      }
    }
  }
  return Array.from(candidates).filter(Boolean);
};

const findLocalReceiptForAsset = (
  receipts: CaptureReceipt[],
  assetId: string
): CaptureReceipt | null => {
  const candidates = buildAssetIdCandidates(assetId);
  for (const candidate of candidates) {
    const match = locateBestLocalReceipt(receipts, { assetId: candidate });
    if (match) {
      return match;
    }
  }
  return null;
};

const VerifyScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [assetSummaries, setAssetSummaries] = useState<AssetSummary[]>([]);
  const [assetsLoading, setAssetsLoading] = useState<boolean>(false);
  const [selectedAsset, setSelectedAsset] = useState<SelectedAssetDetails | null>(null);
  const [verificationState, setVerificationState] = useState<VerificationState>({ status: "idle" });
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const assetsLoadingRef = useRef(false);
  const assetIdsRef = useRef<string[]>([]);
  const [localReceipts, setLocalReceipts] = useState<CaptureReceipt[]>([]);
  const localReceiptsRef = useRef<CaptureReceipt[]>([]);

  const ensureMediaPermissions = useCallback(async () => {
    const existing = (await MediaLibrary.getPermissionsAsync()) as PermissionDetails;
    if (hasLibraryAccess(existing)) {
      return true;
    }
    if (!existing.canAskAgain) {
      setLibraryError("Media library access was denied. Enable it in system settings to verify captures.");
      return false;
    }
    const request = (await MediaLibrary.requestPermissionsAsync()) as PermissionDetails;
    if (!hasLibraryAccess(request)) {
      setLibraryError("Media library access is required to pick a file.");
      return false;
    }
    return true;
  }, []);

  const fetchAssetSummaries = useCallback(async () => {
    setAssetsLoading(true);
    setLibraryError(null);
    try {
      const page = await MediaLibrary.getAssetsAsync({
        first: 200,
        sortBy: [MediaLibrary.SortBy.creationTime],
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      });
      const sortedAssets = [...page.assets].sort(
        (a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0)
      );
      const summaries = await Promise.all(
        sortedAssets.map(async (asset) => {
          let previewUri: string | null = asset.uri ?? null;
          try {
            const info = await MediaLibrary.getAssetInfoAsync(asset.id, {
              shouldDownloadFromNetwork: false,
            });
            previewUri = info.localUri ?? info.uri ?? asset.uri ?? null;
          } catch (error) {
            console.warn("Preview fetch failed", asset.id, error);
          }
          return toAssetSummary(asset, previewUri);
        })
      );
      setAssetSummaries(summaries);
      assetIdsRef.current = summaries.map((item) => item.id);
      if (summaries.length === 0) {
        setLibraryError("No media found in the device library yet.");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load media from the device library.";
      setLibraryError(message);
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  const refreshLocalReceipts = useCallback(async (): Promise<CaptureReceipt[]> => {
    try {
      const receipts = await loadLocalReceipts();
      setLocalReceipts(receipts);
      localReceiptsRef.current = receipts;
      return receipts;
    } catch (error) {
      console.warn("Failed to load local receipts", error);
      return localReceiptsRef.current;
    }
  }, []);

  const loadLatestAssets = useCallback(async () => {
    if (assetsLoadingRef.current) {
      return;
    }

    const permitted = await ensureMediaPermissions();
    if (!permitted) {
      return;
    }

    assetsLoadingRef.current = true;
    try {
      await fetchAssetSummaries();
    } finally {
      assetsLoadingRef.current = false;
    }
  }, [ensureMediaPermissions, fetchAssetSummaries]);

  const resolveAssetUri = useCallback(async (summary: AssetSummary): Promise<SelectedAssetDetails> => {
    const info = await MediaLibrary.getAssetInfoAsync(summary.id, {
      shouldDownloadFromNetwork: true,
    });
    const uri = info.localUri ?? info.uri;
    if (!uri) {
      throw new Error("Unable to access the selected file on this device.");
    }
    const fileInfo = await FileSystem.getInfoAsync(uri);
    return {
      summary,
      uri,
      byteLength: fileInfo.exists && !fileInfo.isDirectory && typeof fileInfo.size === "number"
        ? fileInfo.size
        : null,
    };
  }, []);

  const handleManageLibrary = useCallback(async () => {
    setLibraryError(null);

    try {
      if (
        typeof (MediaLibrary as {
          presentPermissionsPickerAsync?: () => Promise<void>;
        }).presentPermissionsPickerAsync === "function"
      ) {
        await (MediaLibrary as {
          presentPermissionsPickerAsync?: () => Promise<void>;
        }).presentPermissionsPickerAsync!();
      } else {
        await MediaLibrary.requestPermissionsAsync();
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update media library permissions.";
      setLibraryError(message);
      return;
    }

    const baselineSignature = assetIdsRef.current.join("|");
    const maxAttempts = 8;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await delay(attempt === 0 ? 300 : 450);

      const updatedPermissions = (await MediaLibrary.getPermissionsAsync()) as PermissionDetails;
      if (!hasLibraryAccess(updatedPermissions)) {
        setLibraryError(
          "Media library access remains limited. You can grant more items from Settings."
        );
        return;
      }

      await loadLatestAssets();

      const currentSignature = assetIdsRef.current.join("|");
      if (currentSignature !== baselineSignature) {
        return;
      }
    }

    await delay(400);
    await loadLatestAssets();
  }, [loadLatestAssets]);

  useEffect(() => {
    loadLatestAssets().catch((error) => {
      console.warn("Initial media load failed", error);
    });
    refreshLocalReceipts().catch((error) => {
      console.warn("Initial receipt load failed", error);
    });
  }, [loadLatestAssets, refreshLocalReceipts]);

  const handleVerifyAsset = useCallback(
    async (summary: AssetSummary) => {
      setVerificationState({ status: "loading", label: "Preparing media…" });
      setSelectedAsset(null);

      try {
        const receipts = await refreshLocalReceipts();
        const resolved = await resolveAssetUri(summary);
        setSelectedAsset(resolved);

        const candidateReceipt = findLocalReceiptForAsset(receipts, summary.id);

        setVerificationState({ status: "loading", label: "Querying Supabase…" });
        const assetIdSource = candidateReceipt?.assetId ?? summary.id;
        const assetIdCandidates = buildAssetIdCandidates(assetIdSource);
        let rows: SupabaseReceiptRow[] = [];
        if (assetIdCandidates.length > 0) {
          rows = await fetchSupabaseReceipts({ assetIds: assetIdCandidates });
        }

        setVerificationState({ status: "loading", label: "Computing digest…" });
        const digest = await computeDigestForFile(resolved.uri);
        const digestLower = digest.toLowerCase();

        if (rows.length === 0) {
          const digestCandidates = new Set<string>();
          if (candidateReceipt) {
            digestCandidates.add(candidateReceipt.digest.toLowerCase());
          }
          digestCandidates.add(digestLower);

          for (const candidate of digestCandidates) {
            setVerificationState({ status: "loading", label: "Querying Supabase…" });
            rows = await fetchSupabaseReceipts({ digest: candidate });
            if (rows.length > 0) {
              break;
            }
          }
        }

        if (rows.length === 0) {
          setVerificationState({ status: "not_found", digest });
          return;
        }

        const receipt = rows[0];

        setVerificationState({ status: "loading", label: "Validating signature…" });
        const signatureValid = await verifySignatureWithFile({
          fileUri: resolved.uri,
          signature: receipt.signature,
          publicKey: receipt.public_key,
        });
        const digestMatches =
          receipt.digest.trim().toLowerCase() === digest.trim().toLowerCase();

        let deviceRecord: SupabaseDeviceRow | null = null;
        try {
          deviceRecord = await fetchDeviceRecord(receipt.device_id);
        } catch (deviceError) {
          console.warn("Device lookup failed during verification", deviceError);
        }

        const verdict: VerificationVerdictLabel = digestMatches
          ? signatureValid
            ? deviceRecord
              ? "VERIFIED"
              : "STALE"
            : "SIGNATURE_INVALID"
          : "DIGEST_MISMATCH";

        setVerificationState({
          status: "verified",
          digest,
          receipt,
          deviceRecord,
          digestMatches,
          signatureValid,
          verdict,
          message: formatVerdictMessage(verdict),
          matches: rows.length,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Verification failed while preparing the file.";
        setVerificationState({ status: "error", message });
      }
    },
    [resolveAssetUri]
  );

  const verificationInstructions = useMemo(() => {
    if (assetsLoading) {
      return "Loading your media library…";
    }
    if (assetSummaries.length === 0) {
      return "No media available yet. Capture a photo/video or use Manage access to share more items.";
    }
    return "Tap a thumbnail to verify its receipt. Use Refresh after capturing new media.";
  }, [assetsLoading, assetSummaries.length]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top, 16) + 16 },
      ]}
    >
      <Text style={styles.title}>Verify a capture</Text>
      <Text style={styles.subtitle}>
        Choose a local photo or video. Eidolon will hash the file, look up the digest in Supabase,
        and re-run the Ed25519 signature check to confirm authenticity.
      </Text>

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.primaryButton, assetsLoading && styles.buttonDisabled]}
          onPress={loadLatestAssets}
          disabled={assetsLoading}
        >
          {assetsLoading ? (
            <ActivityIndicator size="small" color="#121726" />
          ) : (
            <Text style={styles.primaryButtonLabel}>Refresh library</Text>
          )}
        </Pressable>
        <Pressable style={styles.manageButton} onPress={handleManageLibrary}>
          <Text style={styles.manageButtonLabel}>Manage access</Text>
        </Pressable>
      </View>

      <Text style={styles.instructions}>{verificationInstructions}</Text>
      {libraryError && <Text style={styles.errorText}>{libraryError}</Text>}
      {!assetsLoading && assetSummaries.length === 0 && !libraryError && (
        <Text style={styles.emptyLibraryText}>
          Media library appears empty. Capture something new or adjust access permissions.
        </Text>
      )}

      <View style={styles.assetGrid}>
        {assetSummaries.map((asset) => (
          <Pressable
            key={asset.id}
            style={[
              styles.assetTile,
              selectedAsset?.summary.id === asset.id && styles.assetTileSelected,
            ]}
            onPress={() => handleVerifyAsset(asset)}
          >
            {asset.thumbnailUri ? (
              <Image source={{ uri: asset.thumbnailUri }} style={styles.assetImage} />
            ) : (
              <View style={styles.assetPlaceholder}>
                <Text style={styles.assetPlaceholderText}>No preview</Text>
              </View>
            )}
            <View style={styles.assetOverlay}>
              <Text style={styles.assetOverlayText}>
                {asset.mediaType === "photo" ? "Photo" : "Video"}
                {asset.duration ? ` • ${asset.duration.toFixed(1)}s` : ""}
              </Text>
              <Text style={styles.assetOverlaySub}>{formatCreationTime(asset.createdAt)}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.verificationPanel}>
        <Text style={styles.panelTitle}>Verification status</Text>
        {selectedAsset && (
          <View style={styles.selectedDetails}>
            <Text style={styles.selectedName}>{selectedAsset.summary.filename}</Text>
            <Text style={styles.selectedMeta}>
              {selectedAsset.summary.mediaType === "photo" ? "Photo" : "Video"} •{" "}
              {formatBytes(selectedAsset.byteLength)}
            </Text>
          </View>
        )}

        {verificationState.status === "idle" && (
          <Text style={styles.panelHint}>
            Pick a media file to begin.
          </Text>
        )}

        {verificationState.status === "loading" && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#5da9ff" />
            <Text style={styles.loadingText}>{verificationState.label}</Text>
          </View>
        )}

        {verificationState.status === "error" && (
          <Text style={styles.panelError}>{verificationState.message}</Text>
        )}

        {verificationState.status === "not_found" && (
          <View style={styles.panelCard}>
            <Text style={styles.panelVerdict}>UNVERIFIABLE</Text>
            <Text style={styles.panelMessage}>
              No Supabase receipt matched the digest below. If this capture is recent,
              run “Sync receipts” from Settings to upload the sidecar.
            </Text>
            <Text style={styles.panelDigestLabel}>Digest</Text>
            <Text style={styles.panelDigest}>{verificationState.digest}</Text>
          </View>
        )}

        {verificationState.status === "verified" && (
          <View style={styles.panelCard}>
            <Text style={styles.panelVerdict}>{verificationState.verdict}</Text>
            <Text style={styles.panelMessage}>{verificationState.message}</Text>

            <Text style={styles.panelDigestLabel}>Digest</Text>
            <Text style={styles.panelDigest}>{verificationState.digest}</Text>

            <Text style={styles.panelLine}>
              Hash match:{" "}
              <Text
                style={
                  verificationState.digestMatches ? styles.statusGood : styles.statusWarn
                }
              >
                {verificationState.digestMatches ? "Yes" : "Mismatch"}
              </Text>
            </Text>
            <Text style={styles.panelLine}>
              Signature:{" "}
              <Text
                style={
                  verificationState.signatureValid ? styles.statusGood : styles.statusWarn
                }
              >
                {verificationState.signatureValid ? "Valid" : "Invalid"}
              </Text>
            </Text>

            <Text style={styles.panelDigestLabel}>Supabase record</Text>
            <Text style={styles.panelLine}>
              Asset ID: {verificationState.receipt.asset_id}
            </Text>
            <Text style={styles.panelLine}>
              Device: {verificationState.receipt.device_id}
            </Text>
            <Text style={styles.panelLine}>
              Signed: {formatTimestamp(verificationState.receipt.signed_at)}
            </Text>
            {verificationState.deviceRecord && (
              <Text style={styles.panelLine}>
                Device model: {verificationState.deviceRecord.device_model ?? "Unknown"}
              </Text>
            )}
            {verificationState.matches > 1 && (
              <Text style={styles.panelLine}>
                Additional matches: {verificationState.matches - 1}
              </Text>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090f1a",
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#f7f9ff",
  },
  subtitle: {
    fontSize: 14,
    color: "#adb6cc",
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#4b89ff",
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonLabel: {
    color: "#f7f9ff",
    fontWeight: "700",
    fontSize: 15,
  },
  manageButton: {
    marginLeft: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2c3b58",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#0f1728",
  },
  manageButtonLabel: {
    color: "#d4dcf2",
    fontWeight: "600",
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  instructions: {
    color: "#8b97b3",
    fontSize: 13,
  },
  errorText: {
    color: "#f48b8f",
    fontSize: 13,
  },
  emptyLibraryText: {
    color: "#8b97b3",
    fontSize: 12,
    marginTop: 4,
  },
  assetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
    marginTop: 12,
  },
  assetTile: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "#101829",
    borderWidth: 2,
    borderColor: "transparent",
    marginHorizontal: 6,
    marginBottom: 12,
    flexBasis: "30%",
    maxWidth: "30%",
    aspectRatio: 1,
  },
  assetTileSelected: {
    borderColor: "#4b89ff",
  },
  assetImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  assetPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#131f38",
  },
  assetPlaceholderText: {
    color: "#6f7a95",
    fontSize: 12,
  },
  assetOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "rgba(9, 15, 26, 0.7)",
  },
  assetOverlayText: {
    color: "#f0f5ff",
    fontSize: 11,
    fontWeight: "600",
  },
  assetOverlaySub: {
    color: "#b4bed6",
    fontSize: 10,
  },
  verificationPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f2a3f",
    backgroundColor: "#0f182a",
    padding: 18,
    marginTop: 16,
    gap: 12,
  },
  panelTitle: {
    color: "#f7f9ff",
    fontWeight: "700",
    fontSize: 16,
  },
  selectedDetails: {
    gap: 4,
  },
  selectedName: {
    color: "#f7f9ff",
    fontSize: 15,
    fontWeight: "600",
  },
  selectedMeta: {
    color: "#8b97b3",
    fontSize: 13,
  },
  panelHint: {
    color: "#8b97b3",
    fontSize: 13,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  loadingText: {
    color: "#c1cbe4",
    fontSize: 13,
    marginLeft: 8,
  },
  panelError: {
    color: "#f48b8f",
    fontSize: 13,
    lineHeight: 18,
  },
  panelCard: {
    gap: 8,
  },
  panelVerdict: {
    color: "#7aa2ff",
    fontWeight: "700",
    fontSize: 14,
  },
  panelMessage: {
    color: "#c1cbe4",
    fontSize: 13,
    lineHeight: 18,
  },
  panelDigestLabel: {
    color: "#8b97b3",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  panelDigest: {
    color: "#f0f5ff",
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    fontSize: 12,
  },
  panelLine: {
    color: "#d1d8eb",
    fontSize: 13,
  },
  statusGood: {
    color: "#79d8a4",
    fontWeight: "700",
  },
  statusWarn: {
    color: "#f48b8f",
    fontWeight: "700",
  },
});

export default VerifyScreen;
