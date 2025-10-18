import { StyleSheet, Text, View } from "react-native";

const VerifyScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify</Text>
      <Text style={styles.body}>
        TODO: Select a media item or fetch by hash, recompute the residual
        statistics, and compare against stored receipt metrics. Show verdicts
        and a timeline of nearby reality pings.
      </Text>
      <Text style={styles.todo}>
        • Pull receipts from Supabase by media hash or sidecar reference.
      </Text>
      <Text style={styles.todo}>
        • Re-run Ed25519 signature checks and correlation thresholds.
      </Text>
      <Text style={styles.todo}>
        • Visualize PRNU correlation and entropy deltas for judges.
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

