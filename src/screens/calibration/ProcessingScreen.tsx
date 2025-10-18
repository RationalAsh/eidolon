import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Button,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { CalibrationStackParamList } from "./CalibrationNavigator";

type Props = NativeStackScreenProps<CalibrationStackParamList, "CalibrationProcess">;

const PROCESS_STEPS = [
  "Normalising flat-field stack…",
  "Subtracting dark-current baseline…",
  "Extracting PRNU residual…",
  "Quantising fingerprint descriptor…",
];

const HEATMAP_SIZE = 8;

const ProcessingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { flatFramesCaptured, darkFramesCaptured } = route.params;
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const heatmapAnim = useRef(new Animated.Value(0)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;
  const heatmapSeeds = useMemo(
    () =>
      Array.from({ length: HEATMAP_SIZE * HEATMAP_SIZE }, () => ({
        intensity: Math.random(),
      })),
    []
  );

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
          Flat frames: <Text style={styles.emphasis}>{flatFramesCaptured}</Text>
        </Text>
        <Text style={styles.summaryText}>
          Dark frames: <Text style={styles.emphasis}>{darkFramesCaptured}</Text>
        </Text>
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
          {heatmapSeeds.map((seed, index) => {
            const key = `cell-${index}`;
            const intensity = seed.intensity;
            const cool = `rgba(60, 90, 150, ${0.25 + intensity * 0.25})`;
            const warm = `rgba(255, 120, 60, ${0.35 + intensity * 0.45})`;
            const backgroundColor = heatmapAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [cool, warm],
            });

            return (
              <Animated.View
                key={key}
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
        disabled={!completed}
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
    width: `${100 / HEATMAP_SIZE - 1.5}%`,
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
});

export default ProcessingScreen;

