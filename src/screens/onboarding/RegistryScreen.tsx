import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Button,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RootStackParamList } from "../../navigation/AppNavigator";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import {
  DeviceIdentity,
  getPublicKeyFingerprint,
  getStoredIdentity,
} from "../../services/deviceIdentity";
import {
  confirmRegistration,
  registerDevice,
} from "../../services/deviceRegistry";
import { resetOnboardingState } from "../../services/onboardingReset";
import { useConfirmation } from "../../hooks/useConfirmation";

type Props = NativeStackScreenProps<RootStackParamList, "OnboardingRegistry">;
type RegistryStatus = "unknown" | "idle" | "registering" | "registered";

const MIN_ANIMATION_MS = 1400;

const RegistryScreen: React.FC<Props> = ({ navigation }) => {
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [status, setStatus] = useState<RegistryStatus>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [resetting, setResetting] = useState(false);
  const supabaseReady = isSupabaseConfigured();

  const pulse = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirm = useConfirmation();

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
    const loop = Animated.loop(
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

    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setChecking(true);
      try {
        const stored = await getStoredIdentity();
        if (!stored) {
          if (isMounted) {
            setStatus("idle");
            setError("No device identity found. Go back and generate one first.");
          }
          return;
        }

        if (isMounted) {
          setIdentity(stored);
          const fp = await getPublicKeyFingerprint(stored.publicKey);
          if (isMounted) {
            setFingerprint(fp);
          }
        }

        if (supabaseReady && stored) {
          try {
            const registered = await confirmRegistration(stored);
            if (isMounted) {
              setStatus(registered ? "registered" : "idle");
            }
          } catch (err) {
            if (isMounted) {
              setStatus("idle");
              setError(parseError(err));
            }
          }
        } else if (isMounted) {
          setStatus("idle");
          if (!supabaseReady) {
            setError(
              "Supabase credentials missing. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
            );
          }
        }
      } finally {
        if (isMounted) {
          setChecking(false);
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
  }, [supabaseReady, parseError]);

  const runSuccessAnimation = useCallback(() => {
    shimmer.setValue(0);
    Animated.timing(shimmer, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [shimmer]);

  const handleRegister = useCallback(async () => {
    if (!identity) {
      setError("Missing device identity.");
      return;
    }
    if (!supabaseReady) {
      setError(
        "Supabase credentials missing. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
      );
      return;
    }
    setStatus("registering");
    setError(null);
    shimmer.setValue(0);

    const start = Date.now();
    try {
      await registerDevice(identity);
      const elapsed = Date.now() - start;
      const delay = Math.max(MIN_ANIMATION_MS - elapsed, 0);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setStatus("registered");
        runSuccessAnimation();
        timeoutRef.current = null;
      }, delay);
    } catch (err) {
      setStatus("idle");
      setError(parseError(err));
    }
  }, [identity, parseError, runSuccessAnimation, supabaseReady]);

  const handleContinue = useCallback(() => {
    navigation.replace("Calibration");
  }, [navigation]);

  const fingerprintDisplay = useMemo(() => {
    if (!fingerprint) {
      return "Pending";
    }
    return fingerprint.slice(0, 32).match(/.{1,4}/g)?.join(" ").toUpperCase();
  }, [fingerprint]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  const shimmerOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const registerDisabled =
    status !== "idle" ||
    !identity ||
    !supabaseReady ||
    checking ||
    resetting;
  const continueDisabled = status !== "registered" || resetting;

  const handleReset = useCallback(() => {
    confirm(
      {
        title: "Reset onboarding?",
        message:
          "This removes the local device identity and attempts to delete the Supabase registry record so you can start fresh.",
        confirmLabel: "Reset",
      },
      () => {
        setResetting(true);
        setError(null);
        (async () => {
          try {
            await resetOnboardingState();
          } catch (err) {
            const message = parseError(err);
            setError(`${message} (Local keys removed; remote record may still exist).`);
            Alert.alert(
              "Supabase cleanup failed",
              `${message}\n\nLocal keys were removed, but the remote record may remain.`
            );
          } finally {
            setIdentity(null);
            setFingerprint(null);
            setStatus("idle");
            setResetting(false);
            navigation.replace("OnboardingIdentity");
          }
        })();
      }
    );
  }, [confirm, navigation, parseError]);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Animated.View
          style={[
            styles.pulse,
            { transform: [{ scale }] },
            status === "registered" && styles.pulseSuccess,
          ]}
        >
          <Animated.View
            style={[
              styles.pulseInner,
              status === "registered" && styles.pulseInnerSuccess,
              { opacity: shimmerOpacity },
            ]}
          />
        </Animated.View>
        <Text style={styles.heroTitle}>Register with Supabase</Text>
        <Text style={styles.heroSubtitle}>
          We anchor your public key and device metadata in the shared registry.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Device summary</Text>
        <Text style={styles.cardText}>
          Device ID:{" "}
          <Text style={styles.mono}>{identity?.deviceId ?? "Missing"}</Text>
        </Text>
        <Text style={styles.cardText}>
          Pubkey fingerprint: <Text style={styles.mono}>{fingerprintDisplay}</Text>
        </Text>
        <Text style={styles.helper}>
          Requires Supabase RLS policy allowing anon inserts into `devices`.
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
            status === "registering"
              ? "Registering…"
              : status === "registered"
              ? "Device registered"
              : "Register device"
          }
          onPress={handleRegister}
          disabled={registerDisabled}
        />
        {(status === "registering" || checking) && (
          <ActivityIndicator color="#5da9ff" style={styles.spinner} />
        )}
        <Button
          title="Continue to calibration"
          onPress={handleContinue}
          disabled={continueDisabled}
        />
      </View>

      <View style={styles.footer}>
        <Button
          title={resetting ? "Resetting…" : "Reset onboarding state"}
          onPress={handleReset}
          color="#f1707a"
          disabled={resetting}
        />
        {resetting && (
          <ActivityIndicator color="#f1707a" style={styles.resetSpinner} />
        )}
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
  pulse: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(93, 169, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(93, 169, 255, 0.35)",
  },
  pulseSuccess: {
    backgroundColor: "rgba(45, 184, 120, 0.18)",
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
  footer: {
    gap: 8,
  },
  spinner: {
    marginTop: -6,
    marginBottom: -2,
  },
  resetSpinner: {
    marginTop: 4,
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

export default RegistryScreen;
