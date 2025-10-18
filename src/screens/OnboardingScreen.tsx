import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { Button, ScrollView, StyleSheet, Text, View } from "react-native";
import { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

const OnboardingScreen: React.FC<Props> = ({ navigation }) => {
  const handleStartCalibration = useCallback(() => {
    navigation.navigate("Calibration");
  }, [navigation]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Welcome to EntropyCam</Text>
      <Text style={styles.subtitle}>
        Capture sensor-rooted media, sign receipts, and verify authenticity.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Demo Flow</Text>
        <Text style={styles.item}>1. Register device and derive local keys.</Text>
        <Text style={styles.item}>
          2. Calibrate camera to extract a private PRNU fingerprint.
        </Text>
        <Text style={styles.item}>
          3. Capture media, sign sidecar receipts, and push to the registry.
        </Text>
        <Text style={styles.item}>
          4. Verify media integrity and correlate with reality pings.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hackathon TODOs</Text>
        <Text style={styles.item}>
          • Wire up Supabase auth + device registration endpoints.
        </Text>
        <Text style={styles.item}>
          • Implement PRNU calibration and residual extraction.
        </Text>
        <Text style={styles.item}>
          • Build receipt signing, uploads, and verification views.
        </Text>
      </View>

      <Button title="Start Calibration" onPress={handleStartCalibration} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    gap: 16,
    backgroundColor: "#0b0f18",
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
    backgroundColor: "#131a2a",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f6f9ff",
    marginBottom: 8,
  },
  item: {
    fontSize: 14,
    color: "#d4d9e6",
    marginBottom: 4,
  },
});

export default OnboardingScreen;

