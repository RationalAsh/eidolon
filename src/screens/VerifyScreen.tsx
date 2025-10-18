import { StyleSheet, Text, View } from "react-native";

const VerifyScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify</Text>
      <Text style={styles.body}>
        TODO: Select a media item or fetch by digest, pull the matching receipt
        from Supabase, and verify the Ed25519 signature. Summarize metadata and
        show any nearby reality pings.
      </Text>
      <Text style={styles.todo}>
        • Query Supabase `device_receipt_signatures` by asset id / digest.
      </Text>
      <Text style={styles.todo}>
        • Re-run Ed25519 signature checks locally and surface verdicts.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#090f1a",
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

export default VerifyScreen;
