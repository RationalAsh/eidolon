import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import {
  Animated,
  Button,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { CalibrationStackParamList } from "./CalibrationNavigator";

type Props = NativeStackScreenProps<CalibrationStackParamList, "CalibrationDark">;

const TARGET_FRAMES = 30;

const DarkFrameScreen: React.FC<Props> = ({ navigation, route }) => {
  const { flatFramesCaptured } = route.params;
  const [captured, setCaptured] = useState(0);
  const animatedBar = useRef(new Animated.Value(0)).current;

  const animateProgress = useCallback(
    (toValue: number) => {
      Animated.timing(animatedBar, {
        toValue,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    },
    [animatedBar]
  );

  const handleCapture = useCallback(() => {
    setCaptured((prev) => {
      const next = Math.min(prev + 1, TARGET_FRAMES);
      animateProgress(next / TARGET_FRAMES);
      return next;
    });
  }, [animateProgress]);

  const handleReset = useCallback(() => {
    setCaptured(0);
    animateProgress(0);
  }, [animateProgress]);

  const handleContinue = useCallback(() => {
    navigation.navigate("CalibrationProcess", {
      flatFramesCaptured,
      darkFramesCaptured: captured,
    });
  }, [captured, flatFramesCaptured, navigation]);

  const progressWidth = animatedBar.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dark frame session</Text>
        <Text style={styles.subtitle}>
          Cover the lens completely or place the device face-down. We capture only sensor read noise to subtract from the flat reference.
        </Text>
      </View>

      <View style={styles.preview}>
        <View style={styles.previewInner}>
          <View style={styles.previewMask} />
          <Text style={styles.previewHint}>Dark frame capture mode</Text>
        </View>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Frames captured</Text>
          <Text style={styles.progressCount}>
            {captured}/{TARGET_FRAMES}
          </Text>
        </View>
        <View style={styles.progressBar}>
          <Animated.View
            style={[styles.progressIndicator, { width: progressWidth }]}
          />
        </View>
        <Text style={styles.progressHelper}>
          Target: {TARGET_FRAMES} dark frames. Keep the device steady to avoid stray light leakage.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button title="Capture frame" onPress={handleCapture} />
        <Button title="Reset session" onPress={handleReset} color="#f1707a" />
        <Button
          title="Compute sensor residual"
          onPress={handleContinue}
          disabled={captured < TARGET_FRAMES}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 24,
    backgroundColor: "#050b14",
  },
  header: {
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#f6f9ff",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#c3c8d4",
  },
  preview: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#0b1528",
    padding: 20,
    justifyContent: "center",
  },
  previewInner: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1f2a3d",
    backgroundColor: "#070d1a",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  previewMask: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    bottom: 20,
    borderRadius: 12,
    backgroundColor: "rgba(15, 25, 50, 0.8)",
  },
  previewHint: {
    fontSize: 14,
    color: "#7b88a6",
  },
  progressSection: {
    gap: 8,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    fontSize: 14,
    color: "#d4d9e6",
    fontWeight: "600",
  },
  progressCount: {
    fontSize: 14,
    color: "#f6f9ff",
  },
  progressBar: {
    height: 10,
    borderRadius: 6,
    backgroundColor: "#102036",
    overflow: "hidden",
  },
  progressIndicator: {
    height: "100%",
    borderRadius: 6,
    backgroundColor: "#ff8b94",
  },
  progressHelper: {
    fontSize: 12,
    color: "#8b95ac",
  },
  actions: {
    gap: 12,
  },
});

export default DarkFrameScreen;

