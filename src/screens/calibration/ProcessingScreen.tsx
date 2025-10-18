import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Button,
  Easing,
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

const PROCESS_STEPS = [
  "Normalising flat-field stack…",
  "Subtracting dark-current baseline…",
  "Extracting PRNU residual…",
  "Quantising fingerprint descriptor…",
];

const ProcessingScreen: React.FC<Props> = ({ navigation }) => {
  const { flatFrames, darkFrames, setFingerprint } = useCalibrationSession();
  const flatCount = flatFrames.length;
  const darkCount = darkFrames.length;
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [descriptor, setDescriptor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correlations, setCorrelations] = useState<number[] | null>(null);
  const heatmapAnim = useRef(new Animated.Value(0)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;
  const [heatmapValues, setHeatmapValues] = useState<number[]>(() =>
    Array.from({ length: CALIBRATION_HEATMAP_GRID * CALIBRATION_HEATMAP_GRID }, () => Math.random())
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
        if (
          flatCount < CALIBRATION_TARGET_FRAMES ||
          darkCount < CALIBRATION_TARGET_FRAMES
        ) {
          throw new Error("Insufficient calibration frames. Please restart the calibration flow.");
        }

        const result = await computeFingerprintFromFrames(
          flatFrames.map((frame) => frame.uri),
          darkFrames.map((frame) => frame.uri),
          flatFrames.map((frame) => frame.hash),
          darkFrames.map((frame) => frame.hash)
        );

        if (!isMounted) {
          return;
        }

        setDescriptor(result.descriptor);
        setHeatmapValues(result.heatmap);
        setCorrelations(result.correlations);
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
      }
    };

    processFingerprint();

    return () => {
      isMounted = false;
    };
  }, [darkCount, darkFrames, flatCount, flatFrames, parseError, setFingerprint]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heatmapAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(heatmapAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(waveAnim, {
          toValue: 0,
          duration: 800,
          easing: Easing.in(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    );
    pulse.start();

    const stepTimer = setInterval(() => {
      setStepIndex((prev) => {
        if (prev >= PROCESS_STEPS.length - 1) {
          return prev;
        }
        return prev + 1;
      });
    }, 1400);

    const finishTimer = setTimeout(() => {
      loop.stop();
      pulse.stop();
      setCompleted(true);
      setStepIndex(PROCESS_STEPS.length - 1);
      heatmapAnim.setValue(1);
      waveAnim.setValue(1);
    }, 5200);

    return () => {
      loop.stop();
      pulse.stop();
      clearInterval(stepTimer);
      clearTimeout(finishTimer);
    };
  }, [heatmapAnim, waveAnim]);

  const handleContinue = useCallback(() => {
    const parent = navigation.getParent();
    parent?.navigate("MainTabs");
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Processing sensor fingerprint</Text>
        <Text style={styles.summaryText}>
          Flat frames: <Text style={styles.emphasis}>{flatCount}</Text>
        </Text>
        <Text style={styles.summaryText}>
          Dark frames: <Text style={styles.emphasis}>{darkCount}</Text>
        </Text>
        {correlations && correlations.length > 0 && (
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

      <View style={styles.heatmapContainer}>
        <Animated.View
          style={[
            styles.wave,
            {
              opacity: waveAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.15, 0.45],
              }),
              transform: [
                {
                  scale: waveAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1.05],
                  }),
                },
              ],
            },
          ]}
        />
        <View style={styles.heatmap}>
          {heatmapValues.map((value, index) => {
            const cool = `rgba(60, 90, 150, ${0.25 + value * 0.25})`;
            const warm = `rgba(255, 120, 60, ${0.35 + value * 0.45})`;
            const backgroundColor = heatmapAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [cool, warm],
            });

            return (
              <Animated.View
                key={`cell-${index}`}
                style={[styles.heatCell, { backgroundColor }]}
              />
            );
          })}
        </View>
        <View style={styles.legend}>
          <View style={[styles.legendSwatch, { backgroundColor: "#3a5aa1" }]} />
          <Text style={styles.legendLabel}>Low correlation</Text>
          <View style={[styles.legendSwatch, { backgroundColor: "#ff794d" }]} />
          <Text style={styles.legendLabel}>High correlation</Text>
        </View>
      </View>

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

      <View style={styles.stepper}>
        {PROCESS_STEPS.map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <View
              style={[
                styles.stepDot,
                index <= stepIndex ? styles.stepDotActive : styles.stepDotIdle,
              ]}
            />
            <Text
              style={[
                styles.stepLabel,
                index <= stepIndex ? styles.stepLabelActive : undefined,
              ]}
            >
              {step}
            </Text>
          </View>
        ))}
      </View>

      <Button
        title={completed ? "View capture workspace" : "Crunching sensor noise…"}
        onPress={handleContinue}
        disabled={!completed || !!error}
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
  heatmapContainer: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#0c1626",
    padding: 20,
    position: "relative",
    overflow: "hidden",
    justifyContent: "center",
  },
  wave: {
    position: "absolute",
    top: -40,
    left: -40,
    right: -40,
    bottom: -40,
    borderRadius: 30,
    backgroundColor: "#15253d",
  },
  heatmap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "center",
    width: "80%",
    aspectRatio: 1,
    gap: 4,
  },
  heatCell: {
    width: `${100 / CALIBRATION_HEATMAP_GRID - 1.5}%`,
    aspectRatio: 1,
    borderRadius: 4,
  },
  legend: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
    color: "#8b95ac",
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
  stepper: {
    gap: 10,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  stepDotActive: {
    borderColor: "#5da9ff",
    backgroundColor: "rgba(93, 169, 255, 0.35)",
  },
  stepDotIdle: {
    borderColor: "#25344a",
    backgroundColor: "transparent",
  },
  stepLabel: {
    fontSize: 14,
    color: "#7b88a6",
  },
  stepLabelActive: {
    color: "#f6f9ff",
    fontWeight: "600",
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
