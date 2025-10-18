import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Button,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RootStackParamList } from "../../navigation/AppNavigator";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import {
  confirmRegistration,
} from "../../services/deviceRegistry";
import {
  DeviceIdentity,
  getStoredIdentity,
  isRegisteredLocally,
} from "../../services/deviceIdentity";

type Props = NativeStackScreenProps<RootStackParamList, "OnboardingIntro">;

const IntroScreen: React.FC<Props> = ({ navigation }) => {
  const [checking, setChecking] = useState<boolean>(true);

  const getRegistrationStatus = useCallback(
    async (identity: DeviceIdentity): Promise<boolean> => {
      if (await isRegisteredLocally()) {
        return true;
      }

      if (!isSupabaseConfigured()) {
        return false;
      }

      try {
        return await confirmRegistration(identity);
      } catch (error) {
        console.warn("Failed to validate registration on launch", error);
        return false;
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setChecking(true);

      (async () => {
        try {
          const identity = await getStoredIdentity();
          if (!identity) {
            return;
          }

          const registered = await getRegistrationStatus(identity);
          if (registered && isActive) {
            isActive = false;
            navigation.reset({
              index: 0,
              routes: [{ name: "MainTabs" }],
            });
            return;
          }
        } finally {
          if (isActive) {
            setChecking(false);
          }
        }
      })();

      return () => {
        isActive = false;
      };
    }, [getRegistrationStatus, navigation])
  );

  const handleGetStarted = useCallback(() => {
    navigation.navigate("OnboardingIdentity");
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Eidolon</Text>
        <Text style={styles.subtitle}>Sensor-rooted reality receipts in seconds</Text>

        <View style={styles.logoContainer}>
          <View style={styles.logoInner} />
        </View>
      </View>

      <View style={styles.footer}>
        {checking && (
          <View style={styles.status}>
            <ActivityIndicator color="#5da9ff" />
            <Text style={styles.statusText}>Checking device status…</Text>
          </View>
        )}
        <Button
          title="Get started"
          onPress={handleGetStarted}
          disabled={checking}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050b14",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  content: {
    alignItems: "center",
    gap: 16,
  },
  title: {
    fontSize: 40,
    fontWeight: "800",
    color: "#f6f9ff",
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    color: "#c3c8d4",
    textAlign: "center",
    lineHeight: 22,
  },
  logoContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(93, 169, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "#5da9ff",
    backgroundColor: "rgba(93, 169, 255, 0.16)",
  },
  footer: {
    width: "100%",
    alignItems: "center",
    gap: 12,
  },
  status: {
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    fontSize: 12,
    color: "#7b88a6",
  },
});

export default IntroScreen;
