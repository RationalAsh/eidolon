import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "OnboardingIntro">;

const IntroScreen: React.FC<Props> = ({ navigation }) => {
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

      <Button title="Get started" onPress={handleGetStarted} />
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
});

export default IntroScreen;

