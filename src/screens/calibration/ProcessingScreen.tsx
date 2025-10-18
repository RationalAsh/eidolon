import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Button,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { CalibrationStackParamList } from "./CalibrationNavigator";
import { useCalibrationSession } from "../../context/CalibrationSessionContext";
import {
  FingerprintRecord,
  saveFingerprintRecord,
} from "../../services/calibrationStorage";
import {
  CALIBRATION_TARGET_FRAMES,
  CALIBRATION_HEATMAP_GRID,
} from "./constants";
import { computeFingerprintFromFrames } from "../../utils/prnu";

type Props = NativeStackScreenProps<CalibrationStackParamList, "CalibrationProcess">;

const heatmapColorForValue = (value: number) => {
  const clamped = Math.max(0, Math.min(1, value));
  if (clamped < 0.25) {
    return "#1e40af";
  }
  if (clamped < 0.5) {
    return "#2563eb";
  }
  if (clamped < 0.75) {
    return "#f97316";
  }
  return "#ef4444";
};

const ProcessingScreen: React.FC<Props> = ({ navigation }) => {
  const { flatFrames, darkFrames, setFingerprint } = useCalibrationSession();
  const flatCount = flatFrames.length;
  const darkCount = darkFrames.length;
  const [processing, setProcessing] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [descriptor, setDescriptor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correlations, setCorrelations] = useState<number[] | null>(null);
  const [heatmapReady, setHeatmapReady] = useState(false);
  const [heatmapValues, setHeatmapValues] = useState<number[]>(() =>
    Array.from({ length: CALIBRATION_HEATMAP_GRID * CALIBRATION_HEATMAP_GRID }, () => 0.5)
  );
  const fingerprintSaved = useRef(false);

  const parseError = useCallback((err: unknown) => {
    if (err instanceof Error) {
      return err.message;
    }
    if (typeof err === "string") {
      return err;
    }
    if (err && typeof err === "object" && "message" in err) {
      const message = (err as { message?: unknown }).message;
      return typeof message === "string"
        ? message
        : "Unexpected error encountered.";
    }
    return "Unexpected error encountered.";
  }, []);

  useEffect(() => {
    let isMounted = true;

    const processFingerprint = async () => {
      try {
        if (isMounted) {
          setProcessing(true);
          setCompleted(false);
          setHeatmapReady(false);
        }

        if (
          flatCount < CALIBRATION_TARGET_FRAMES ||
          darkCount < CALIBRATION_TARGET_FRAMES
        ) {
          throw new Error("Insufficient calibration frames. Please restart the calibration flow.");
        }

        const result = await computeFingerprintFromFrames(
          flatFrames.map((frame) => ({
            uri: frame.uri,
            hash: frame.hash,
            sampleUri: frame.sampleUri ?? undefined,
          })),
          darkFrames.map((frame) => ({
            uri: frame.uri,
            hash: frame.hash,
            sampleUri: frame.sampleUri ?? undefined,
          }))
        );

        if (!isMounted) {
          return;
        }

        setDescriptor(result.descriptor);
        setHeatmapValues(result.heatmap);
        setCorrelations(result.correlations);
        setHeatmapReady(true);
        setFingerprint({
          descriptor: result.descriptor,
          vector: Array.from(result.fingerprint),
          size: result.size,
          heatmap: result.heatmap,
          correlations: result.correlations,
        });

        if (!fingerprintSaved.current) {
          const record: FingerprintRecord = {
            descriptor: result.descriptor,
            createdAt: new Date().toISOString(),
            flatFrames: flatCount,
            darkFrames: darkCount,
            size: result.size,
            fingerprint: Array.from(result.fingerprint),
            correlations: result.correlations,
            heatmap: result.heatmap,
          };
          await saveFingerprintRecord(record);
          fingerprintSaved.current = true;
        }
      } catch (err) {
        if (isMounted) {
          setError(parseError(err));
        }
      } finally {
        if (isMounted) {
          setProcessing(false);
          setCompleted(true);
        }
      }
    };

    processFingerprint();

    return () => {
      isMounted = false;
    };
  }, [darkCount, darkFrames, flatCount, flatFrames, parseError, setFingerprint]);

  const handleContinue = useCallback(() => {
    const parent = navigation.getParent();
    parent?.navigate("MainTabs");
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>PRNU calibration</Text>
        <Text style={styles.summaryText}>
          Flat frames collected: <Text style={styles.emphasis}>{flatCount}</Text>
        </Text>
        <Text style={styles.summaryText}>
          Dark frames collected: <Text style={styles.emphasis}>{darkCount}</Text>
        </Text>
        {correlations && correlations.length > 0 && heatmapReady && (
          <Text style={styles.summaryText}>
            Avg PRNU correlation:{" "}
            <Text style={styles.emphasis}>
              {(
                correlations.reduce((acc, value) => acc + value, 0) /
                correlations.length
              ).toFixed(3)}
            </Text>
          </Text>
        )}
        <Text style={styles.summaryHint}>
          We align, denoise, subtract, and normalise to derive the device-specific PRNU residual.
        </Text>
      </View>

      {processing && !error && (
        <View style={styles.loadingPane}>
          <ActivityIndicator
            color="#5da9ff"
            size="large"
          />
          <Text style={styles.loadingText}>Crunching PRNU residuals…</Text>
          <Text style={styles.loadingSubtext}>
            We process every frame on-device. Leave the app open until this finishes.
          </Text>
        </View>
      )}

      {!processing && heatmapReady && !error && (
        <View style={styles.heatmapContainer}>
          <Text style={styles.heatmapTitle}>Correlation heatmap</Text>
          <View style={styles.heatmap}>
            {heatmapValues.map((value, index) => (
              <View
                key={`cell-${index}`}
                style={[
                  styles.heatCell,
                  {
                    backgroundColor: heatmapColorForValue(value),
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.legend}>
            <View style={[styles.legendSwatch, { backgroundColor: "#1e40af" }]} />
            <Text style={styles.legendLabel}>Low</Text>
            <View style={[styles.legendSwatch, { backgroundColor: "#ef4444" }]} />
            <Text style={styles.legendLabel}>High</Text>
          </View>
        </View>
      )}

      {descriptor && (
        <View style={styles.descriptorBox}>
          <Text style={styles.descriptorLabel}>Fingerprint descriptor</Text>
          <Text style={styles.descriptorValue}>{descriptor.slice(0, 32)}…</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorLabel}>Issue</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Button
        title={completed && !processing ? "View capture workspace" : "Processing…"}
        onPress={handleContinue}
        disabled={processing || !!error}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050b14",
    padding: 24,
    gap: 24,
  },
  summaryCard: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: "#101a2b",
    gap: 6,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f6f9ff",
  },
  summaryText: {
    fontSize: 14,
    color: "#d4d9e6",
  },
  emphasis: {
    color: "#5da9ff",
    fontWeight: "700",
  },
  summaryHint: {
    fontSize: 12,
    color: "#8b95ac",
    marginTop: 6,
  },
  loadingPane: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#0c1626",
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f6f9ff",
  },
  loadingSubtext: {
    fontSize: 13,
    color: "#9aa4ba",
    textAlign: "center",
    lineHeight: 18,
  },
  heatmapContainer: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#0c1626",
    padding: 24,
    gap: 16,
  },
  heatmapTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f6f9ff",
  },
  heatmap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "center",
    width: "78%",
    aspectRatio: 1,
    gap: 4,
    backgroundColor: "#050b14",
    borderRadius: 12,
    padding: 10,
  },
  heatCell: {
    width: `${100 / CALIBRATION_HEATMAP_GRID - 1.5}%`,
    aspectRatio: 1,
    borderRadius: 4,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    justifyContent: "center",
  },
  legendSwatch: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 13,
    color: "#c0c8da",
  },
  descriptorBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#0f1b2d",
    gap: 6,
  },
  descriptorLabel: {
    fontSize: 12,
    color: "#8b95ac",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  descriptorValue: {
    fontSize: 14,
    color: "#f6f9ff",
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "Courier",
    }),
  },
  errorBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255, 95, 109, 0.16)",
    gap: 4,
  },
  errorLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ff8b94",
    textTransform: "uppercase",
  },
  errorText: {
    fontSize: 13,
    color: "#ffd3d6",
  },
});

export default ProcessingScreen;
