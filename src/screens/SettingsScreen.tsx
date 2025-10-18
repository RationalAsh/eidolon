import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useConfirmation } from "../hooks/useConfirmation";
import {
  DeviceIdentity,
  getPublicKeyFingerprint,
  getStoredIdentity,
  isRegisteredLocally,
} from "../services/deviceIdentity";
import { resetOnboardingState } from "../services/onboardingReset";

const SettingsScreen: React.FC = () => {
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [registered, setRegistered] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [resetting, setResetting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirmation();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const parseError = useCallback((err: unknown): string => {
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

  const refreshIdentity = useCallback(async () => {
    if (!isMountedRef.current) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const stored = await getStoredIdentity();
      if (!stored) {
        if (!isMountedRef.current) {
          return;
        }
        setIdentity(null);
        setFingerprint(null);
        setRegistered(false);
        return;
      }

      const fp = await getPublicKeyFingerprint(stored.publicKey);
      const registeredLocally = await isRegisteredLocally();

      if (!isMountedRef.current) {
        return;
      }

      setIdentity(stored);
      setFingerprint(fp);
      setRegistered(registeredLocally);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      setError(parseError(err));
      setIdentity(null);
      setFingerprint(null);
      setRegistered(false);
    } finally {
      if (!isMountedRef.current) {
        return;
      }
      setLoading(false);
    }
  }, [parseError]);

  useFocusEffect(
    useCallback(() => {
      refreshIdentity();
    }, [refreshIdentity])
  );

  const handleReset = useCallback(() => {
    confirm(
      {
        title: "Reset onboarding state?",
        message:
          "This removes the local device identity and attempts to delete the Supabase registry entry.",
        confirmLabel: "Reset",
      },
      () => {
        setResetting(true);
        setError(null);

        (async () => {
          try {
            await resetOnboardingState();
            await refreshIdentity();
            Alert.alert("Reset complete", "Onboarding state cleared.");
          } catch (err) {
            const message = parseError(err);
            setError(message);
            Alert.alert(
              "Reset issues",
              `${message}\n\nLocal keys were removed, but the Supabase record may remain.`
            );
          } finally {
            setResetting(false);
          }
        })();
      }
    );
  }, [confirm, parseError, refreshIdentity]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device identity</Text>
        {loading ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color="#5da9ff" />
            <Text style={styles.statusText}>Loading identity…</Text>
          </View>
        ) : identity ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Device ID</Text>
            <Text style={styles.cardValue}>{identity.deviceId}</Text>
            <Text style={styles.cardLabel}>Pubkey fingerprint</Text>
            <Text style={styles.cardValueMono}>
              {fingerprint
                ? fingerprint
                    .slice(0, 40)
                    .match(/.{1,4}/g)
                    ?.join(" ")
                    ?.toUpperCase()
                : "Unavailable"}
            </Text>
            <Text style={styles.cardHelper}>
              Registration status:{" "}
              <Text style={registered ? styles.statusGood : styles.statusWarn}>
                {registered ? "Registered" : "Pending registry"}
              </Text>
            </Text>
          </View>
        ) : (
          <Text style={styles.emptyText}>
            No identity minted yet. Complete onboarding to generate a device key.
          </Text>
        )}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorLabel}>Issue</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button
          title={resetting ? "Resetting…" : "Reset onboarding state"}
          onPress={handleReset}
          color="#f1707a"
          disabled={resetting || loading}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#080f1d",
    gap: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#f7f9ff",
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f7f9ff",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  statusText: {
    fontSize: 13,
    color: "#a3acc2",
  },
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#101a2b",
    gap: 8,
  },
  cardLabel: {
    fontSize: 13,
    color: "#8b95ac",
  },
  cardValue: {
    fontSize: 14,
    color: "#d7dce6",
  },
  cardValueMono: {
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "Courier",
    }),
    fontSize: 13,
    color: "#d7dce6",
    letterSpacing: 1,
  },
  cardHelper: {
    fontSize: 12,
    color: "#95a1bb",
    marginTop: 4,
  },
  statusGood: {
    color: "#46d39a",
    fontWeight: "600",
  },
  statusWarn: {
    color: "#f6a85c",
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 14,
    color: "#a3acc2",
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
    marginTop: "auto",
  },
});

export default SettingsScreen;
