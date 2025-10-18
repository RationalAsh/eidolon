import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Calibration">;

const CalibrationScreen: React.FC<Props> = ({ navigation }) => {
  const handleContinue = useCallback(() => {
    navigation.replace("MainTabs");
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Calibration Checklist</Text>
      <Text style={styles.description}>
        Capture 30 flat frames (even lighting) and 30 dark frames to estimate
        the device-specific sensor fingerprint. The PRNU vector stays on-device
        and only a hashed descriptor is uploaded.
      </Text>

      <View style={styles.stepCard}>
        <Text style={styles.stepLabel}>Flat Frames</Text>
        <Text style={styles.stepDetail}>
          Aim at an evenly lit surface. Slowly move the device to spread noise.
        </Text>
      </View>

      <View style={styles.stepCard}>
        <Text style={styles.stepLabel}>Dark Frames</Text>
        <Text style={styles.stepDetail}>
          Cover the lens completely and capture the dark-current baseline.
        </Text>
      </View>

      <View style={styles.stepCard}>
        <Text style={styles.stepLabel}>Compute Residual</Text>
        <Text style={styles.stepDetail}>
          Derive the median reference frame, subtract the low-pass component,
          and normalize for storage.
        </Text>
      </View>

      <Button title="Continue to App" onPress={handleContinue} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 20,
    padding: 24,
    backgroundColor: "#060b12",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#f1f4fa",
  },
  description: {
    fontSize: 15,
    color: "#c1c7d1",
    lineHeight: 22,
  },
  stepCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#101826",
  },
  stepLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f1f4fa",
    marginBottom: 4,
  },
  stepDetail: {
    fontSize: 14,
    color: "#c1c7d1",
    lineHeight: 20,
  },
});

export default CalibrationScreen;

