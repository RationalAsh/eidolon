import { StyleSheet, Text, View } from "react-native";

const CaptureScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Capture</Text>
      <Text style={styles.body}>
        TODO: Integrate expo-camera to capture photo, audio, and sensor bursts.
        After capture, compute residuals, assemble the digest payload, and sign
        with the device key from SecureStore.
      </Text>
      <Text style={styles.todo}>
        • Add live PRNU correlation preview to validate calibration.
      </Text>
      <Text style={styles.todo}>
        • Stream uploads to Supabase Storage and receipts table.
      </Text>
      <Text style={styles.todo}>• Attach nearby reality pings for context.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#0b121f",
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#f7f9ff",
  },
  body: {
    fontSize: 15,
    color: "#d7dce6",
    lineHeight: 22,
  },
  todo: {
    fontSize: 14,
    color: "#a3acc2",
  },
});

export default CaptureScreen;

