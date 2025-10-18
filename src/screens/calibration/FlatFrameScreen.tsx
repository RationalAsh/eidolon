import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Button,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import type { CalibrationStackParamList } from "./CalibrationNavigator";
import { useCalibrationSession } from "../../context/CalibrationSessionContext";
import { CALIBRATION_TARGET_FRAMES } from "./constants";
import { persistCalibrationFrame } from "../../services/calibrationStorage";
import { createGrayscaleSampleFromBase64 } from "../../utils/prnu";

type Props = NativeStackScreenProps<CalibrationStackParamList, "CalibrationFlat">;

const FlatFrameScreen: React.FC<Props> = ({ navigation }) => {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { flatFrames, addFrame, resetSession } = useCalibrationSession();
  const captured = flatFrames.length;
  const animatedBar = useRef(new Animated.Value(0)).current;
  const [capturing, setCapturing] = useState(false);
  const [captureMode, setCaptureMode] = useState<"single" | "burst" | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    animateProgress(Math.min(captured / CALIBRATION_TARGET_FRAMES, 1));
  }, [animateProgress, captured]);

  useEffect(() => {
    if (!permission) {
      requestPermission().catch((err) => {
        setError(parseError(err));
      });
    }
  }, [parseError, permission, requestPermission]);

  const handleReset = useCallback(async () => {
    setError(null);
    await resetSession();
    animatedBar.setValue(0);
  }, [animatedBar, resetSession]);

  const captureFrame = useCallback(async () => {
    if (!cameraRef.current) {
      throw new Error("Camera is not ready yet.");
    }

    const photo = await cameraRef.current.takePictureAsync({
      quality: 0.4,
      base64: true,
      skipProcessing: true,
    });

    if (!photo?.uri || !photo.base64) {
      throw new Error("Camera capture failed — missing image data");
    }

    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      photo.base64
    );

    const sample = createGrayscaleSampleFromBase64(photo.base64);
    const artifacts = await persistCalibrationFrame("flat", photo.uri, sample);
    addFrame("flat", {
      uri: artifacts.imageUri,
      sampleUri: artifacts.sampleUri,
      hash,
      width: sample.width,
      height: sample.height,
    });

    await FileSystem.deleteAsync(photo.uri, { idempotent: true });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }, [addFrame]);

  const runCaptureSequence = useCallback(
    async (mode: "single" | "burst", desiredCount: number) => {
      if (capturing) {
        return;
      }
      setError(null);
      setCapturing(true);
      setCaptureMode(mode);

      try {
        const remaining = Math.max(
          0,
          CALIBRATION_TARGET_FRAMES - captured
        );
        const framesToCapture = Math.min(desiredCount, remaining);

        if (framesToCapture <= 0) {
          return;
        }

        for (let i = 0; i < framesToCapture; i += 1) {
          await captureFrame();

          if (mode === "burst" && i < framesToCapture - 1) {
            await new Promise<void>((resolve) => setTimeout(resolve, 120));
          }
        }
      } catch (err) {
        setError(parseError(err));
      } finally {
        setCapturing(false);
        setCaptureMode(null);
      }
    },
    [captured, capturing, captureFrame, parseError]
  );

  const handleCapture = useCallback(() => {
    runCaptureSequence("single", 1);
  }, [runCaptureSequence]);

  const handleBurstCapture = useCallback(() => {
    runCaptureSequence("burst", CALIBRATION_TARGET_FRAMES);
  }, [runCaptureSequence]);

  const handleContinue = useCallback(() => {
    navigation.navigate("CalibrationDark", {
      flatFramesCaptured: captured,
    });
  }, [captured, navigation]);

  const progressWidth = animatedBar.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#5da9ff" />
        <Text style={styles.permissionText}>Requesting camera access…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>
          Eidolon needs camera access to capture calibration frames.
        </Text>
        <Button title="Grant camera permission" onPress={requestPermission} />
      </View>
    );
  }

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
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="front"
            mode="picture"
          />
          <Text style={styles.previewHint}>Flat field capture mode</Text>
        </View>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Frames captured</Text>
          <Text style={styles.progressCount}>
            {captured}/{CALIBRATION_TARGET_FRAMES}
          </Text>
        </View>
        <View style={styles.progressBar}>
          <Animated.View
            style={[styles.progressIndicator, { width: progressWidth }]}
          />
        </View>
        <Text style={styles.progressHelper}>
          Target: {CALIBRATION_TARGET_FRAMES} evenly exposed frames. More frames give a better noise fingerprint.
        </Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorLabel}>Issue</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button
          title={
            capturing
              ? captureMode === "burst"
                ? "Capturing burst…"
                : "Capturing…"
              : "Capture frame"
          }
          onPress={handleCapture}
          disabled={capturing || captured >= CALIBRATION_TARGET_FRAMES}
        />
        <Button
          title={capturing ? "Capturing burst…" : "Capture remaining automatically"}
          onPress={handleBurstCapture}
          disabled={
            capturing || captured >= CALIBRATION_TARGET_FRAMES
          }
        />
        <Button
          title="Reset session"
          onPress={handleReset}
          color="#f1707a"
          disabled={capturing || captured === 0}
        />
        <Button
          title="Continue to dark frames"
          onPress={handleContinue}
          disabled={captured < CALIBRATION_TARGET_FRAMES || capturing}
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
    overflow: "hidden",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  previewHint: {
    fontSize: 14,
    color: "#f6f9ff",
    marginBottom: 16,
    backgroundColor: "rgba(5, 11, 20, 0.55)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
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
  centered: {
    flex: 1,
    backgroundColor: "#050b14",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  permissionText: {
    fontSize: 15,
    color: "#d4d9e6",
    textAlign: "center",
  },
});

export default FlatFrameScreen;
