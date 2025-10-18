import { StyleSheet, Text, View } from "react-native";

const SettingsScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.body}>
        TODO: Surface device metadata, Supabase session details, and toggles
        for periodic reality pings. Provide options to reset calibration or
        export public key fingerprints for backup verification.
      </Text>
      <Text style={styles.todo}>
        • Display derived device ID and pubkey fingerprint (base58).
      </Text>
      <Text style={styles.todo}>
        • Manage background ping interval and GPS granularity.
      </Text>
      <Text style={styles.todo}>
        • Add developer utilities: dump receipt JSON, run local verifications.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#080f1d",
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

export default SettingsScreen;

