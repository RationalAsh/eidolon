import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  Platform,
  View,
} from "react-native";
import { RootStackParamList } from "../navigation/AppNavigator";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import {
  DeviceIdentity,
  ensureIdentity,
  getPublicKeyFingerprint,
  getStoredIdentity,
  isRegisteredLocally,
  markRegistered,
} from "../services/deviceIdentity";
import {
  confirmRegistration,
  registerDevice,
} from "../services/deviceRegistry";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;
type RegistrationState = "unknown" | "not-registered" | "registered";

const supabaseReady = isSupabaseConfigured();

const OnboardingScreen: React.FC<Props> = ({ navigation }) => {
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registrationState, setRegistrationState] =
    useState<RegistrationState>("unknown");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parseError = useCallback((error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    if (error && typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;
      return typeof message === "string"
        ? message
        : "Unexpected error encountered.";
    }
    return "Unexpected error encountered.";
  }, []);

  const refreshIdentity = useCallback(async () => {
    try {
      setErrorMessage(null);
      const stored = await getStoredIdentity();

      if (!stored) {
        setIdentity(null);
        setFingerprint(null);
        setRegistrationState("not-registered");
        return;
      }

      setIdentity(stored);

      const fp = await getPublicKeyFingerprint(stored.publicKey);
      setFingerprint(fp);

      const localRegistered = await isRegisteredLocally();

      if (supabaseReady) {
        try {
          const remoteRegistered = await confirmRegistration(stored);
          if (remoteRegistered && !localRegistered) {
            await markRegistered();
          }
          setRegistrationState(
            remoteRegistered ? "registered" : "not-registered"
          );
        } catch (error) {
          console.warn("Supabase lookup failed:", error);
          setRegistrationState(localRegistered ? "registered" : "not-registered");
        }
      } else {
        setRegistrationState(localRegistered ? "registered" : "not-registered");
      }
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  }, [parseError, supabaseReady]);

  useEffect(() => {
    setInitializing(true);
    refreshIdentity().finally(() => setInitializing(false));
  }, [refreshIdentity]);

  const handleGenerateKeys = useCallback(async () => {
    setLoadingKeys(true);
    setErrorMessage(null);
    try {
      const generated = await ensureIdentity();
      setIdentity(generated);

      const fp = await getPublicKeyFingerprint(generated.publicKey);
      setFingerprint(fp);

      setRegistrationState("not-registered");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setLoadingKeys(false);
    }
  }, [parseError]);

  const handleRegister = useCallback(async () => {
    setRegistering(true);
    setErrorMessage(null);

    try {
      const currentIdentity = identity ?? (await ensureIdentity());
      setIdentity(currentIdentity);

      if (!supabaseReady) {
        throw new Error(
          "Supabase credentials missing. Populate EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
        );
      }

      await registerDevice(currentIdentity);

      setRegistrationState("registered");
      navigation.navigate("Calibration");
    } catch (error) {
      setErrorMessage(parseError(error));
      setRegistrationState("not-registered");
    } finally {
      setRegistering(false);
    }
  }, [identity, navigation, parseError]);

  const handleContinue = useCallback(() => {
    navigation.navigate("Calibration");
  }, [navigation]);

  const fingerprintDisplay = useMemo(() => {
    if (!fingerprint) {
      return "Pending";
    }

    return fingerprint.slice(0, 32).match(/.{1,4}/g)?.join(" ").toUpperCase();
  }, [fingerprint]);

  const deviceIdDisplay = identity?.deviceId ?? "Not generated";

  const registrationLabel = useMemo(() => {
    switch (registrationState) {
      case "registered":
        return "Registered";
      case "not-registered":
        return "Pending";
      default:
        return "Unknown";
    }
  }, [registrationState]);

  const canGenerate = !identity && !loadingKeys;
  const canRegister =
    !!identity && !registering && registrationState !== "registered";
  const canContinue =
    identity !== null && registrationState === "registered" && !registering;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Welcome to Eidolon</Text>
      <Text style={styles.subtitle}>
        Let’s mint a device-bound identity, sync it with Supabase, and get you
        ready for calibration.
      </Text>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Device identity</Text>
          <StatusPill
            label={identity ? "Ready" : "Pending"}
            variant={identity ? "success" : "warning"}
          />
        </View>
        <Text style={styles.bodyText}>
          Device ID: <Text style={styles.mono}>{deviceIdDisplay}</Text>
        </Text>
        <Text style={styles.bodyText}>
          Pubkey fingerprint:{" "}
          <Text style={styles.mono}>{fingerprintDisplay}</Text>
        </Text>

        <Button
          title={
            identity ? "Device identity stored" : "Generate device identity"
          }
          onPress={handleGenerateKeys}
          disabled={!canGenerate}
        />
        {loadingKeys && (
          <ActivityIndicator color="#5da9ff" style={styles.spinner} />
        )}
        <Text style={styles.helperText}>
          Keys are generated locally via Ed25519 and stored securely using the
          system keychain.
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Supabase registry</Text>
          <StatusPill
            label={registrationLabel}
            variant={
              registrationState === "registered" ? "success" : "warning"
            }
          />
        </View>

        <Text style={styles.bodyText}>
          Supabase status:{" "}
          <Text style={styles.mono}>
            {supabaseReady ? "Configured" : "Missing credentials"}
          </Text>
        </Text>
        <Text style={styles.bodyText}>
          This step stores your public key + metadata in the `devices` table via
          the anon key.
        </Text>

        <Button
          title={
            registrationState === "registered"
              ? "Device registered"
              : registering
              ? "Registering…"
              : "Register device"
          }
          onPress={handleRegister}
          disabled={!canRegister}
        />
        {registering && (
          <ActivityIndicator color="#5da9ff" style={styles.spinner} />
        )}
        <Text style={styles.helperText}>
          Expect a nonce challenge + signed response once auth wiring lands.
        </Text>
      </View>

      {errorMessage && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorLabel}>Issue</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <Button
        title="Continue to calibration"
        onPress={handleContinue}
        disabled={!canContinue}
      />

      {initializing && (
        <ActivityIndicator color="#5da9ff" style={styles.initialSpinner} />
      )}
    </ScrollView>
  );
};

type StatusPillProps = {
  label: string;
  variant: "success" | "warning";
};

const StatusPill: React.FC<StatusPillProps> = ({ label, variant }) => (
  <View
    style={[
      styles.pill,
      variant === "success" ? styles.pillSuccess : styles.pillWarning,
    ]}
  >
    <Text style={styles.pillText}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    gap: 18,
    backgroundColor: "#050b14",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#e8ecf4",
  },
  subtitle: {
    fontSize: 16,
    color: "#c3c8d4",
    lineHeight: 22,
  },
  section: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#111a2c",
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f6f9ff",
  },
  bodyText: {
    fontSize: 14,
    color: "#d4d9e6",
    lineHeight: 20,
  },
  helperText: {
    fontSize: 12,
    color: "#8b95ac",
    lineHeight: 18,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillSuccess: {
    backgroundColor: "rgba(45, 184, 120, 0.2)",
  },
  pillWarning: {
    backgroundColor: "rgba(255, 184, 77, 0.2)",
  },
  pillText: {
    fontSize: 12,
    color: "#f6f9ff",
    fontWeight: "600",
    textTransform: "uppercase",
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
  spinner: {
    marginTop: 6,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 10,
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
  initialSpinner: {
    marginTop: 12,
  },
});

export default OnboardingScreen;
