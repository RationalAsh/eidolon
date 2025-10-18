import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Button,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RootStackParamList } from "../../navigation/AppNavigator";
import {
  DeviceIdentity,
  ensureIdentity,
  getPublicKeyFingerprint,
  getStoredIdentity,
} from "../../services/deviceIdentity";

type Props = NativeStackScreenProps<RootStackParamList, "OnboardingIdentity">;
type IdentityStatus = "idle" | "generating" | "success";

const MIN_ANIMATION_MS = 1400;

const IdentityScreen: React.FC<Props> = ({ navigation }) => {
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

  const [status, setStatus] = useState<IdentityStatus>("idle");
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const stored = await getStoredIdentity();
        if (stored && isMounted) {
          setIdentity(stored);
          const fp = await getPublicKeyFingerprint(stored.publicKey);
          if (isMounted) {
            setFingerprint(fp);
            setStatus("success");
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(parseError(err));
        }
      }
    })();
    return () => {
      isMounted = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [parseError]);

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();
    return () => {
      pulseLoop.stop();
    };
  }, [pulse]);

  const fingerprintDisplay = useMemo(() => {
    if (!fingerprint) {
      return "Pending";
    }
    return fingerprint.slice(0, 32).match(/.{1,4}/g)?.join(" ").toUpperCase();
  }, [fingerprint]);

  const runSuccessAnimation = useCallback(() => {
    shimmer.setValue(0);
    Animated.timing(shimmer, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [shimmer]);

  const handleGenerate = useCallback(async () => {
    setStatus("generating");
    setError(null);
    shimmer.setValue(0);

    const start = Date.now();
    try {
      const generated = await ensureIdentity();
      setIdentity(generated);
      const fp = await getPublicKeyFingerprint(generated.publicKey);
      setFingerprint(fp);

      const elapsed = Date.now() - start;
      const delay = Math.max(MIN_ANIMATION_MS - elapsed, 0);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setStatus("success");
        runSuccessAnimation();
        timeoutRef.current = null;
      }, delay);
    } catch (err) {
      setStatus("idle");
      setError(parseError(err));
    }
  }, [parseError, runSuccessAnimation, shimmer]);

  const handleContinue = useCallback(() => {
    navigation.navigate("OnboardingRegistry");
  }, [navigation]);

  const canGenerate = status !== "generating" && status !== "success";
  const canContinue = status === "success";

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  const shimmerOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Animated.View
          style={[
            styles.pulseCircle,
            { transform: [{ scale }] },
            status === "success" && styles.pulseSuccess,
          ]}
        >
          <Animated.View
            style={[
              styles.pulseInner,
              status === "success" && styles.pulseInnerSuccess,
              { opacity: shimmerOpacity },
            ]}
          />
        </Animated.View>
        <Text style={styles.heroTitle}>Create device identity</Text>
        <Text style={styles.heroSubtitle}>
          We mint an Ed25519 keypair locally and pin a fingerprint for the registry.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Device snapshot</Text>
        <Text style={styles.cardText}>
          Device ID:{" "}
          <Text style={styles.mono}>
            {identity?.deviceId ?? "Not yet generated"}
          </Text>
        </Text>
        <Text style={styles.cardText}>
          Pubkey fingerprint: <Text style={styles.mono}>{fingerprintDisplay}</Text>
        </Text>
        <Text style={styles.helper}>
          Stored in SecureStore. Private key never leaves the device.
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
            status === "generating"
              ? "Minting identity…"
              : status === "success"
              ? "Identity ready"
              : "Generate device identity"
          }
          onPress={handleGenerate}
          disabled={!canGenerate}
        />
        {status === "generating" && (
          <ActivityIndicator color="#5da9ff" style={styles.spinner} />
        )}
        <Button
          title="Continue"
          onPress={handleContinue}
          disabled={!canContinue}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050b14",
    padding: 24,
    justifyContent: "space-between",
    gap: 24,
  },
  hero: {
    alignItems: "center",
    gap: 16,
  },
  pulseCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(93, 169, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseSuccess: {
    backgroundColor: "rgba(45, 184, 120, 0.18)",
  },
  pulseInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(93, 169, 255, 0.35)",
  },
  pulseInnerSuccess: {
    backgroundColor: "rgba(45, 184, 120, 0.6)",
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#f6f9ff",
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#c3c8d4",
    textAlign: "center",
  },
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#101a2b",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f6f9ff",
  },
  cardText: {
    fontSize: 14,
    color: "#d4d9e6",
  },
  helper: {
    fontSize: 12,
    color: "#8b95ac",
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
  actions: {
    gap: 12,
  },
  spinner: {
    marginTop: -6,
    marginBottom: -2,
  },
  mono: {
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "Courier",
    }),
    fontSize: 13,
    color: "#f6f9ff",
  },
});

export default IdentityScreen;
