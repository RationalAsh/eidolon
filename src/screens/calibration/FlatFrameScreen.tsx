import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import {
  Button,
  StyleSheet,
  Text,
  View,
  Animated,
  Easing,
} from "react-native";
import type { CalibrationStackParamList } from "./CalibrationNavigator";

type Props = NativeStackScreenProps<CalibrationStackParamList, "CalibrationFlat">;

const TARGET_FRAMES = 30;

const FlatFrameScreen: React.FC<Props> = ({ navigation }) => {
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
    navigation.navigate("CalibrationDark", {
      flatFramesCaptured: captured,
    });
  }, [captured, navigation]);

  const progressWidth = animatedBar.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Flat frame session</Text>
        <Text style={styles.subtitle}>
          Point at an evenly lit surface (sheet of paper, sky, wall) and gently
          move the device to bake in sensor grain without scene texture.
        </Text>
      </View>

      <View style={styles.preview}>
        <View style={styles.previewInner}>
          <View style={styles.previewGrid} />
          <Text style={styles.previewHint}>Flat field capture mode</Text>
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
          Target: {TARGET_FRAMES} evenly exposed frames. More frames give a better noise fingerprint.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button title="Capture frame" onPress={handleCapture} />
        <Button title="Reset session" onPress={handleReset} color="#f1707a" />
        <Button
          title="Continue to dark frames"
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
    backgroundColor: "#101d34",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  previewGrid: {
    position: "absolute",
    top: 18,
    left: 18,
    right: 18,
    bottom: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#20314a",
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
    backgroundColor: "#5da9ff",
  },
  progressHelper: {
    fontSize: 12,
    color: "#8b95ac",
  },
  actions: {
    gap: 12,
  },
});

export default FlatFrameScreen;
