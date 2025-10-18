import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { CaptureReceipt } from "../types/capture";
import {
  buildVerificationVerdict,
  fetchDeviceRecord,
  fetchSupabaseReceipts,
  formatVerdictMessage,
  locateBestLocalReceipt,
  loadLocalReceipts,
  SupabaseDeviceRow,
  SupabaseReceiptRow,
  VerificationReport,
  verifySupabaseReceiptWithLocal,
} from "../services/verification";

type SearchMode = "asset" | "digest";

const VerifyScreen: React.FC = () => {
  const [searchMode, setSearchMode] = useState<SearchMode>("asset");
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<SupabaseReceiptRow[]>([]);
  const [verifications, setVerifications] = useState<Record<string, VerificationReport>>({});
  const [deviceCache, setDeviceCache] = useState<Record<string, SupabaseDeviceRow | null>>({});
  const [localReceipts, setLocalReceipts] = useState<CaptureReceipt[]>([]);
  const [localLoading, setLocalLoading] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const localReceiptCount = localReceipts.length;

  const getCachedDeviceRecord = useCallback(
    (deviceId: string): SupabaseDeviceRow | null | undefined => {
      return Object.prototype.hasOwnProperty.call(deviceCache, deviceId)
        ? deviceCache[deviceId] ?? null
        : undefined;
    },
    [deviceCache]
  );

  const refreshLocalReceipts = useCallback(async () => {
    setLocalLoading(true);
    setLocalError(null);
    try {
      const loaded = await loadLocalReceipts();
      setLocalReceipts(loaded);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load local receipt sidecars.";
      setLocalError(message);
      setLocalReceipts([]);
    } finally {
      setLocalLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshLocalReceipts().catch((err) => {
        console.warn("Unable to refresh local receipts", err);
      });
    }, [refreshLocalReceipts])
  );

  const deviceResolution = useCallback(
    async (rows: SupabaseReceiptRow[]) => {
      const unknownIds = Array.from(
        new Set(
          rows
            .map((row) => row.device_id)
            .filter(
              (deviceId) =>
                deviceId && !Object.prototype.hasOwnProperty.call(deviceCache, deviceId)
            )
        )
      );

      if (unknownIds.length === 0) {
        return {} as Record<string, SupabaseDeviceRow | null>;
      }

      const entries = await Promise.all(
        unknownIds.map(async (deviceId) => {
          try {
            const record = await fetchDeviceRecord(deviceId);
            return [deviceId, record] as const;
          } catch (err) {
            console.warn("Device lookup failed", deviceId, err);
            return [deviceId, undefined] as const;
          }
        })
      );

      const updates: Record<string, SupabaseDeviceRow | null> = {};
      entries.forEach(([deviceId, record]) => {
        if (record !== undefined) {
          updates[deviceId] = record;
        }
      });

      if (Object.keys(updates).length > 0) {
        setDeviceCache((prev) => ({
          ...prev,
          ...updates,
        }));
      }

      return updates;
    },
    [deviceCache]
  );

  const buildInitialReport = useCallback(
    (
      row: SupabaseReceiptRow,
      overrides?: { deviceRecord?: SupabaseDeviceRow | null }
    ): VerificationReport => {
      const local = locateBestLocalReceipt(localReceipts, {
        assetId: row.asset_id,
        digest: row.digest,
      });

      const candidateRecord =
        overrides && "deviceRecord" in overrides
          ? overrides.deviceRecord
          : getCachedDeviceRecord(row.device_id);

      return {
        assetId: row.asset_id,
        supabaseReceipt: row,
        deviceRecord: candidateRecord,
        localReceipt: local,
        localFileUri: local
          ? local.sourceUri ?? local.assetUri ?? local.metadataPath ?? null
          : null,
        digestMatches: null,
        signatureValid: null,
        verdict: "INITIAL",
        message: formatVerdictMessage("INITIAL"),
      };
    },
    [getCachedDeviceRecord, localReceipts]
  );

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Enter an asset ID or digest to look up.");
      setReceipts([]);
      setVerifications({});
      return;
    }

    setLoading(true);
    setError(null);
    setVerifications({});

    try {
      const rows = await fetchSupabaseReceipts({
        assetId: searchMode === "asset" ? trimmed : undefined,
        digest: searchMode === "digest" ? trimmed.toLowerCase() : undefined,
      });

      const resolvedDevices = await deviceResolution(rows);
      const snapshot: Record<string, SupabaseDeviceRow | null | undefined> = {
        ...deviceCache,
        ...resolvedDevices,
      };

      const initialReports: Record<string, VerificationReport> = {};
      rows.forEach((row) => {
        const deviceRecord = Object.prototype.hasOwnProperty.call(snapshot, row.device_id)
          ? snapshot[row.device_id] ?? null
          : undefined;
        initialReports[row.asset_id] = buildInitialReport(row, { deviceRecord });
      });

      setReceipts(rows);
      setVerifications(initialReports);

      if (rows.length === 0) {
        setError("No matching Supabase receipts found.");
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to query Supabase. Check configuration and network.";
      setError(message);
      setReceipts([]);
      setVerifications({});
    } finally {
      setLoading(false);
    }
  }, [buildInitialReport, deviceCache, deviceResolution, query, searchMode]);

  const refreshReportForRow = useCallback(
    (row: SupabaseReceiptRow, patch: Partial<VerificationReport>) => {
      setVerifications((prev) => {
        const existing = prev[row.asset_id] ?? buildInitialReport(row);
        const updated: VerificationReport = {
          ...existing,
          ...patch,
        };
        return {
          ...prev,
          [row.asset_id]: updated,
        };
      });
    },
    [buildInitialReport]
  );

  const handleVerifyLocally = useCallback(
    async (row: SupabaseReceiptRow) => {
      refreshReportForRow(row, {
        message: "Verifying…",
      });

      try {
        const local = locateBestLocalReceipt(localReceipts, {
          assetId: row.asset_id,
          digest: row.digest,
        });

        if (!local) {
          refreshReportForRow(row, {
            localReceipt: null,
            digestMatches: null,
            signatureValid: null,
            verdict: "MISSING_MEDIA",
            message: formatVerdictMessage("MISSING_MEDIA"),
          });
          return;
        }

        let deviceRecord = getCachedDeviceRecord(row.device_id);

        if (deviceRecord === undefined) {
          try {
            const fetched = await fetchDeviceRecord(row.device_id);
            deviceRecord = fetched ?? null;
            setDeviceCache((prev) => ({
              ...prev,
              [row.device_id]: deviceRecord ?? null,
            }));
          } catch (err) {
            console.warn("Device lookup failed during verification", row.device_id, err);
            deviceRecord = undefined;
          }
        }

        const { digestMatches, signatureValid, localFileUri } =
          await verifySupabaseReceiptWithLocal(row, local);

        const verdict = buildVerificationVerdict({
          ...(deviceRecord !== undefined ? { deviceRecord } : {}),
          digestMatches,
          signatureValid,
          localReceipt: local,
        });

        const patch: Partial<VerificationReport> = {
          localReceipt: local,
          localFileUri,
          digestMatches,
          signatureValid,
          verdict,
          message: formatVerdictMessage(verdict),
        };

        if (deviceRecord !== undefined) {
          patch.deviceRecord = deviceRecord;
        }

        refreshReportForRow(row, patch);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Verification failed due to an unexpected error.";
        refreshReportForRow(row, {
          verdict: "ERROR",
          message,
        });
      }
    },
    [getCachedDeviceRecord, localReceipts, refreshReportForRow]
  );

  const currentReports = useMemo(() => {
    return receipts.map((row) => verifications[row.asset_id] ?? buildInitialReport(row));
  }, [buildInitialReport, receipts, verifications]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Verify receipts</Text>
      <Text style={styles.subtitle}>
        Look up signed captures in Supabase, then re-validate with local media.
      </Text>

      <View style={styles.searchModeRow}>
        <Pressable
          onPress={() => setSearchMode("asset")}
          style={[
            styles.modeButton,
            searchMode === "asset" && styles.modeButtonActive,
          ]}
        >
          <Text
            style={[
              styles.modeButtonLabel,
              searchMode === "asset" && styles.modeButtonLabelActive,
            ]}
          >
            Asset ID
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSearchMode("digest")}
          style={[
            styles.modeButton,
            searchMode === "digest" && styles.modeButtonActive,
          ]}
        >
          <Text
            style={[
              styles.modeButtonLabel,
              searchMode === "digest" && styles.modeButtonLabelActive,
            ]}
          >
            Digest
          </Text>
        </Pressable>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        style={styles.input}
        placeholder={
          searchMode === "asset"
            ? "Enter asset identifier (ph:// or UUID)"
            : "Enter SHA-256 digest"
        }
        placeholderTextColor="#6a748c"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleSearch}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#121726" />
        ) : (
          <Text style={styles.primaryButtonLabel}>Query Supabase</Text>
        )}
      </Pressable>

      <View style={styles.localSummary}>
        <View style={styles.localSummaryLeft}>
          <Text style={styles.localSummaryLabel}>Local receipts</Text>
          <Text style={styles.localSummaryValue}>
            {localLoading ? "Loading…" : `${localReceiptCount} sidecars`}
          </Text>
          {localError && <Text style={styles.localError}>{localError}</Text>}
        </View>
        <Pressable
          style={styles.secondaryButton}
          onPress={refreshLocalReceipts}
          disabled={localLoading}
        >
          <Text style={styles.secondaryButtonLabel}>
            {localLoading ? "Refreshing…" : "Refresh"}
          </Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Issue</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!error && !loading && receipts.length === 0 && (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            Search for an asset ID or digest to load Supabase receipts.
          </Text>
        </View>
      )}

      {currentReports.map((report) => {
        const deviceRecord =
          report.deviceRecord !== undefined
            ? report.deviceRecord
            : getCachedDeviceRecord(report.supabaseReceipt.device_id);

        const deviceStatus =
          deviceRecord === undefined
            ? "Unknown"
            : deviceRecord === null
            ? "Missing"
            : "Present";

        return (
          <View key={report.assetId} style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>{report.assetId}</Text>
              <Text style={styles.resultVerdict}>{report.verdict}</Text>
            </View>
            <Text style={styles.resultMessage}>{report.message}</Text>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Device</Text>
              <Text style={styles.metaValue}>{report.supabaseReceipt.device_id}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Signed</Text>
              <Text style={styles.metaValue}>
                {report.supabaseReceipt.signed_at ?? "Unknown"}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Media</Text>
              <Text style={styles.metaValue}>
                {report.supabaseReceipt.media_type ?? "unknown"}
                {report.supabaseReceipt.byte_length
                  ? ` • ${(report.supabaseReceipt.byte_length / 1024).toFixed(1)} KB`
                  : ""}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Registry</Text>
              <Text style={styles.metaValue}>{deviceStatus}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Sidecar</Text>
              <Text style={styles.metaValue}>
                {report.localReceipt ? "Found" : "Missing"}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Digest</Text>
              <Text style={styles.metaMono}>
                {report.supabaseReceipt.digest.slice(0, 32)}…
              </Text>
            </View>

            {report.localFileUri && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Local file</Text>
                <Text style={styles.metaValue} numberOfLines={2}>
                  {report.localFileUri}
                </Text>
              </View>
            )}

            {report.digestMatches !== null && (
              <Text style={styles.statusLine}>
                Hash match:{" "}
                <Text style={report.digestMatches ? styles.statusGood : styles.statusWarn}>
                  {report.digestMatches ? "Yes" : "Mismatch"}
                </Text>
              </Text>
            )}

            {report.signatureValid !== null && (
              <Text style={styles.statusLine}>
                Signature:{" "}
                <Text style={report.signatureValid ? styles.statusGood : styles.statusWarn}>
                  {report.signatureValid ? "Valid" : "Invalid"}
                </Text>
              </Text>
            )}

            <Pressable
              style={styles.secondaryButton}
              onPress={() => handleVerifyLocally(report.supabaseReceipt)}
            >
              <Text style={styles.secondaryButtonLabel}>Verify with local media</Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090f1a",
  },
  content: {
    padding: 24,
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
  searchModeRow: {
    flexDirection: "row",
    gap: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f2a3f",
    alignItems: "center",
    backgroundColor: "#121a2c",
  },
  modeButtonActive: {
    borderColor: "#4b89ff",
    backgroundColor: "#1a2842",
  },
  modeButtonLabel: {
    color: "#8b97b3",
    fontWeight: "600",
  },
  modeButtonLabelActive: {
    color: "#f4f7ff",
  },
  input: {
    borderRadius: 10,
    backgroundColor: "#101829",
    borderWidth: 1,
    borderColor: "#1f2a3f",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f7f9ff",
    fontSize: 15,
  },
  primaryButton: {
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
  buttonDisabled: {
    opacity: 0.6,
  },
  localSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1c273b",
    backgroundColor: "#10192c",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  localSummaryLeft: {
    gap: 4,
  },
  localSummaryLabel: {
    color: "#8b97b3",
    fontSize: 13,
    fontWeight: "600",
  },
  localSummaryValue: {
    color: "#f0f3ff",
    fontSize: 15,
    fontWeight: "600",
  },
  localError: {
    color: "#f48b8f",
    fontSize: 12,
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2c3b58",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#0f1728",
  },
  secondaryButtonLabel: {
    color: "#d4dcf2",
    fontWeight: "600",
  },
  errorBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#5d1e2d",
    backgroundColor: "#2b0d16",
    padding: 16,
    gap: 6,
  },
  errorTitle: {
    color: "#f48b8f",
    fontWeight: "700",
    fontSize: 14,
  },
  errorText: {
    color: "#fbd1d3",
    fontSize: 13,
    lineHeight: 19,
  },
  placeholder: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1c273b",
    backgroundColor: "#10192c",
    padding: 16,
  },
  placeholderText: {
    color: "#90a0c0",
    fontSize: 13,
    lineHeight: 19,
  },
  resultCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f2a3f",
    backgroundColor: "#0f182a",
    padding: 18,
    gap: 10,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultTitle: {
    color: "#f7f9ff",
    fontWeight: "700",
    fontSize: 15,
    flex: 1,
    marginRight: 12,
  },
  resultVerdict: {
    color: "#7aa2ff",
    fontWeight: "700",
    fontSize: 12,
  },
  resultMessage: {
    color: "#b9c2d8",
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
  },
  metaLabel: {
    color: "#7c879f",
    fontSize: 13,
    width: 88,
  },
  metaValue: {
    color: "#f0f5ff",
    fontSize: 13,
    flex: 1,
  },
  metaMono: {
    color: "#d7ddf0",
    fontSize: 12,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  statusLine: {
    color: "#acb7cf",
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
