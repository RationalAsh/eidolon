import { useFocusEffect } from "@react-navigation/native";
import Slider from "@react-native-community/slider";
import { CameraType, CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { toByteArray, fromByteArray } from "base64-js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import nacl from "tweetnacl";
import { ensureIdentity } from "../services/deviceIdentity";
import type { CaptureMode, CaptureReceipt } from "../types/capture";

const resolveCaptureDirectory = () => {
  try {
    return FileSystem.Paths.document.uri;
  } catch (error) {
    try {
      return FileSystem.Paths.cache.uri;
    } catch {
      return "";
    }
  }
};

const CAPTURE_METADATA_DIR = `${resolveCaptureDirectory()}captures`;
const DEFAULT_MODE: CaptureMode = "photo";
const DEFAULT_CAMERA: CameraType = "back";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
};

const ensureDirectory = async (path: string) => {
  if (!path) {
    return;
  }
  const dirInfo = await FileSystem.getInfoAsync(path);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
};

type AssetLike = {
  uri: string;
  localUri?: string | null;
};

const getAssetUri = (asset: AssetLike) => {
  if (Platform.OS === "ios") {
    return asset.localUri ?? asset.uri;
  }
  return asset.uri;
};

const CaptureScreen: React.FC = () => {
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [mediaPermission, setMediaPermission] = useState<MediaLibrary.PermissionResponse | null>(null);
  const [cameraType, setCameraType] = useState<CameraType>(DEFAULT_CAMERA);
  const [captureMode, setCaptureMode] = useState<CaptureMode>(DEFAULT_MODE);
  const [zoom, setZoom] = useState<number>(0);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastReceipt, setLastReceipt] = useState<CaptureReceipt | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadMediaPermission = useCallback(async () => {
    const response = await MediaLibrary.getPermissionsAsync();
    setMediaPermission(response);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMediaPermission().catch((error) => {
        console.warn("Unable to load media permissions", error);
      });
    }, [loadMediaPermission])
  );

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (statusMessage) {
      timeoutId = setTimeout(() => setStatusMessage(null), 3200);
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [statusMessage]);

  const requestMediaPermission = useCallback(async () => {
    const response = await MediaLibrary.requestPermissionsAsync();
    setMediaPermission(response);
    return response;
  }, []);

  const ensurePermissions = useCallback(
    async (mode: CaptureMode) => {
      const cameraStatus = cameraPermission?.status;
      if (cameraStatus !== "granted") {
        const result = await requestCameraPermission();
        if (result.status !== "granted") {
          throw new Error("Camera access is required to capture media.");
        }
      }

      if (mode === "video") {
        const micStatus = microphonePermission?.status;
        if (micStatus !== "granted") {
          const result = await requestMicrophonePermission();
          if (result.status !== "granted") {
            throw new Error("Microphone access is required to record video with audio.");
          }
        }
      }

      const mediaStatus = mediaPermission?.status;
      if (mediaStatus !== "granted") {
        const response = await requestMediaPermission();
        if (response.status !== "granted") {
          throw new Error("Media library access is required to save captured media.");
        }
      }
    },
    [
      cameraPermission?.status,
      mediaPermission?.status,
      microphonePermission?.status,
      requestCameraPermission,
      requestMediaPermission,
      requestMicrophonePermission,
    ]
  );

  const toggleCameraFacing = useCallback(() => {
    setCameraType((current) => (current === "back" ? "front" : "back"));
  }, []);

const saveReceipt = useCallback(async (receipt: CaptureReceipt) => {
    await ensureDirectory(CAPTURE_METADATA_DIR);
    const metadataPath = `${CAPTURE_METADATA_DIR}/${receipt.assetId}.json`;
    const record: CaptureReceipt = { ...receipt, metadataPath };
    await FileSystem.writeAsStringAsync(metadataPath, JSON.stringify(record, null, 2));
    setLastReceipt(record);
  }, []);

  const signAndPersist = useCallback(
    async (
      uri: string,
      mode: CaptureMode,
      options: {
        width?: number;
        height?: number;
        duration?: number;
      }
    ) => {
      setIsProcessing(true);
      try {
        await ensureDirectory(CAPTURE_METADATA_DIR);
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: "base64",
        });
        const bytes = toByteArray(base64);

        const identity = await ensureIdentity();
        const privateKeyBytes = toByteArray(identity.privateKey);
        const signatureBytes = nacl.sign.detached(bytes, privateKeyBytes);
        const signature = fromByteArray(signatureBytes);
        const digest = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          base64
        );

        const asset = await MediaLibrary.createAssetAsync(uri);
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);

        const receipt: CaptureReceipt = {
          assetId: asset.id,
          assetUri: getAssetUri(assetInfo),
          mediaType: mode,
          digest,
          signature,
          deviceId: identity.deviceId,
          publicKey: identity.publicKey,
          byteLength: bytes.length,
          signedAt: new Date().toISOString(),
          sourceUri: uri,
          metadataPath: "",
          cameraFacing: cameraType,
          zoom,
          width: options.width ?? assetInfo.width ?? undefined,
          height: options.height ?? assetInfo.height ?? undefined,
          duration: options.duration ?? assetInfo.duration ?? undefined,
          filename: assetInfo.filename ?? asset.filename ?? null,
        };

        await saveReceipt(receipt);
        setStatusMessage(
          mode === "photo" ? "Photo saved with signature." : "Video saved with signature."
        );
      } catch (error) {
        console.error("Failed to process capture:", error);
        Alert.alert(
          "Capture failed",
          error instanceof Error ? error.message : "Unable to store the captured media."
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [cameraType, saveReceipt, zoom]
  );

  const handleTakePhoto = useCallback(async () => {
    if (!cameraRef.current || isProcessing) {
      return;
    }
    try {
      await ensurePermissions("photo");
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: true,
      });
      if (!photo?.uri) {
        throw new Error("Camera did not return a valid photo URI.");
      }
      await signAndPersist(photo.uri, "photo", {
        width: photo.width,
        height: photo.height,
      });
    } catch (error) {
      console.warn("Photo capture failed:", error);
      Alert.alert(
        "Photo capture failed",
        error instanceof Error ? error.message : "Unexpected error while capturing photo."
      );
    }
  }, [ensurePermissions, isProcessing, signAndPersist]);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || isProcessing) {
      return;
    }
    try {
      await ensurePermissions("video");
      setIsRecording(true);
      const recordPromise = cameraRef.current.recordAsync
        ? cameraRef.current.recordAsync()
        : null;
      if (!recordPromise) {
        throw new Error("Video recording is not supported on this device.");
      }
      const recording = await recordPromise;
      if (!recording?.uri) {
        throw new Error("Recording did not produce a valid file.");
      }
      await signAndPersist(recording.uri, "video", {});
    } catch (error) {
      if (error instanceof Error && error.message.includes("User rejected")) {
        // User cancelled recording; no need to surface.
        console.info("Recording cancelled by user.");
      } else {
        console.warn("Video capture failed:", error);
        Alert.alert(
          "Video capture failed",
          error instanceof Error ? error.message : "Unexpected error while recording video."
        );
      }
    } finally {
      setIsRecording(false);
    }
  }, [ensurePermissions, isProcessing, signAndPersist]);

  const stopRecording = useCallback(() => {
    if (cameraRef.current) {
      try {
        cameraRef.current.stopRecording();
      } catch (error) {
        console.warn("Unable to stop recording:", error);
      }
    }
  }, []);

  const handleCapturePress = useCallback(() => {
    if (captureMode === "photo") {
      handleTakePhoto();
    } else if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [captureMode, handleTakePhoto, isRecording, startRecording, stopRecording]);

  const handleModeToggle = useCallback(() => {
    setCaptureMode((mode) => (mode === "photo" ? "video" : "photo"));
  }, []);

  const renderPermissionRequest = () => {
    const cameraGranted = cameraPermission?.granted ?? false;
    const mediaGranted = mediaPermission?.granted ?? false;
    const microphoneGranted =
      captureMode === "video" ? microphonePermission?.granted ?? false : true;

    if (cameraGranted && mediaGranted && microphoneGranted) {
      return null;
    }
    return (
      <View style={styles.permissionBox}>
        <Text style={styles.permissionTitle}>Permissions required</Text>
        {!cameraGranted && (
          <Pressable
            style={styles.permissionButton}
            onPress={() => requestCameraPermission()}
          >
            <Text style={styles.permissionButtonText}>Grant camera access</Text>
          </Pressable>
        )}
        {!mediaGranted && (
          <Pressable style={styles.permissionButton} onPress={() => requestMediaPermission()}>
            <Text style={styles.permissionButtonText}>Grant photo library access</Text>
          </Pressable>
        )}
        {captureMode === "video" && !microphoneGranted && (
          <Pressable
            style={styles.permissionButton}
            onPress={() => requestMicrophonePermission()}
          >
            <Text style={styles.permissionButtonText}>Grant microphone access</Text>
          </Pressable>
        )}
        {(!cameraGranted || !mediaGranted || (captureMode === "video" && !microphoneGranted)) && (
          <Text style={styles.permissionHint}>
            Camera and media permissions are necessary to capture and store receipts locally.
          </Text>
        )}
      </View>
    );
  };

  if (!cameraPermission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#5da9ff" />
        <Text style={styles.loadingText}>Checking camera permissions…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.cameraWrapper}>
        <CameraView
          ref={(ref) => {
            cameraRef.current = ref;
          }}
          facing={cameraType}
          zoom={zoom}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.topControls}>
          <Pressable style={styles.controlButton} onPress={toggleCameraFacing}>
            <Text style={styles.controlLabel}>Flip</Text>
          </Pressable>
          <Pressable style={styles.controlButton} onPress={handleModeToggle} disabled={isRecording}>
            <Text style={styles.controlLabel}>
              Mode: {captureMode === "photo" ? "Photo" : "Video"}
            </Text>
          </Pressable>
        </View>
        <View style={styles.bottomControls}>
          <View style={styles.zoomRow}>
            <Text style={styles.zoomLabel}>Zoom</Text>
            <Slider
              style={styles.zoomSlider}
              minimumValue={0}
              maximumValue={1}
              step={0.01}
              value={zoom}
              onValueChange={setZoom}
              minimumTrackTintColor="#5da9ff"
              maximumTrackTintColor="#1f2636"
              thumbTintColor="#5da9ff"
            />
            <Text style={styles.zoomValue}>{(zoom * 5).toFixed(1)}x</Text>
          </View>
          <View style={styles.captureRow}>
            <Pressable
              onPress={handleCapturePress}
              style={[
                styles.captureButton,
                captureMode === "video" && isRecording && styles.captureRecording,
                isProcessing && styles.captureDisabled,
              ]}
              disabled={isProcessing}
            />
          </View>
          {isProcessing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator color="#ffffff" />
              <Text style={styles.processingLabel}>Processing…</Text>
            </View>
          )}
        </View>
      </View>

      {renderPermissionRequest()}

      {statusMessage && <Text style={styles.statusMessage}>{statusMessage}</Text>}

      {lastReceipt && (
        <View style={styles.receiptCard}>
          <Text style={styles.receiptTitle}>Latest capture</Text>
          <Text style={styles.receiptLine}>Type: {lastReceipt.mediaType}</Text>
          <Text style={styles.receiptLine}>Asset ID: {lastReceipt.assetId}</Text>
          {lastReceipt.filename && (
            <Text style={styles.receiptLine}>Filename: {lastReceipt.filename}</Text>
          )}
          <Text style={styles.receiptLine}>
            Facing: {lastReceipt.cameraFacing} | Device: {lastReceipt.deviceId}
          </Text>
          <Text style={styles.receiptLine}>
            Size: {formatBytes(lastReceipt.byteLength)} | Zoom: {(lastReceipt.zoom * 5).toFixed(1)}x
          </Text>
          {typeof lastReceipt.duration === "number" && lastReceipt.duration > 0 && (
            <Text style={styles.receiptLine}>
              Duration: {lastReceipt.duration.toFixed(1)} seconds
            </Text>
          )}
          <Text style={styles.receiptLine}>Signed: {lastReceipt.signedAt}</Text>
          <Text style={styles.receiptLine}>Digest: {lastReceipt.digest.slice(0, 12)}…</Text>
          <Text style={styles.receiptLine}>
            Signature: {lastReceipt.signature.slice(0, 12)}…
          </Text>
          <Text style={styles.receiptLine}>Metadata file: {lastReceipt.metadataPath}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050b14",
  },
  cameraWrapper: {
    flex: 1,
    backgroundColor: "#000",
    position: "relative",
  },
  topControls: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bottomControls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 24,
    backgroundColor: "rgba(5, 11, 20, 0.45)",
  },
  controlButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(15, 22, 36, 0.8)",
  },
  controlLabel: {
    color: "#f1f4fa",
    fontSize: 14,
    fontWeight: "600",
  },
  zoomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  zoomLabel: {
    color: "#d0d6e5",
    fontSize: 12,
    fontWeight: "600",
    width: 42,
  },
  zoomSlider: {
    flex: 1,
    height: 40,
  },
  zoomValue: {
    color: "#d0d6e5",
    fontSize: 12,
    width: 48,
    textAlign: "right",
  },
  captureRow: {
    alignItems: "center",
    paddingTop: 6,
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 6,
    borderColor: "#f1f4fa",
    backgroundColor: "rgba(241, 244, 250, 0.2)",
  },
  captureRecording: {
    backgroundColor: "#f1707a",
    borderColor: "#f1707a",
  },
  captureDisabled: {
    opacity: 0.5,
  },
  processingOverlay: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
    gap: 6,
  },
  processingLabel: {
    color: "#f1f4fa",
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#050b14",
  },
  loadingText: {
    color: "#d0d6e5",
    fontSize: 14,
  },
  permissionBox: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(15, 22, 36, 0.88)",
    gap: 12,
  },
  permissionTitle: {
    color: "#f6f9ff",
    fontSize: 16,
    fontWeight: "700",
  },
  permissionButton: {
    backgroundColor: "#5da9ff",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  permissionButtonText: {
    color: "#050b14",
    fontSize: 14,
    fontWeight: "600",
  },
  permissionHint: {
    color: "#c3c8d4",
    fontSize: 12,
    lineHeight: 16,
  },
  statusMessage: {
    marginTop: 12,
    marginHorizontal: 16,
    color: "#46d39a",
    fontSize: 13,
    fontWeight: "600",
  },
  receiptCard: {
    margin: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#0f1624",
    gap: 6,
  },
  receiptTitle: {
    color: "#f6f9ff",
    fontSize: 16,
    fontWeight: "700",
  },
  receiptLine: {
    color: "#c3c8d4",
    fontSize: 13,
  },
});

export default CaptureScreen;
