import {
  NavigationContainer,
  DefaultTheme,
  Theme,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  createNativeStackNavigator,
  NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import CalibrationScreen from "../screens/CalibrationScreen";
import CaptureScreen from "../screens/CaptureScreen";
import OnboardingIntroScreen from "../screens/onboarding/IntroScreen";
import OnboardingIdentityScreen from "../screens/onboarding/IdentityScreen";
import OnboardingRegistryScreen from "../screens/onboarding/RegistryScreen";
import SettingsScreen from "../screens/SettingsScreen";
import VerifyScreen from "../screens/VerifyScreen";

export type RootStackParamList = {
  OnboardingIntro: undefined;
  OnboardingIdentity: undefined;
  OnboardingRegistry: undefined;
  Calibration: undefined;
  MainTabs: undefined;
};

export type MainTabParamList = {
  Capture: undefined;
  Verify: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const darkTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#050b14",
    card: "#0f1624",
    text: "#f1f4fa",
    border: "#1b2434",
    primary: "#5da9ff",
  },
};

const screenOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: "#0f1624" },
  headerTintColor: "#f1f4fa",
  headerTitleStyle: { fontWeight: "700" },
};

const TabNavigator = () => (
  <Tabs.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: "#0f1624",
        borderTopColor: "#1b2434",
      },
      tabBarActiveTintColor: "#5da9ff",
      tabBarInactiveTintColor: "#7b88a6",
      tabBarIcon: ({ color, size }) => {
        const iconName = getTabIcon(route.name);
        return <Ionicons name={iconName} size={size} color={color} />;
      },
    })}
  >
    <Tabs.Screen name="Capture" component={CaptureScreen} />
    <Tabs.Screen name="Verify" component={VerifyScreen} />
    <Tabs.Screen name="Settings" component={SettingsScreen} />
  </Tabs.Navigator>
);

const getTabIcon = (routeName: keyof MainTabParamList) => {
  switch (routeName) {
    case "Capture":
      return "camera";
    case "Verify":
      return "shield-checkmark";
    case "Settings":
      return "settings";
    default:
      return "ellipse";
  }
};

const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer theme={darkTheme}>
      <Stack.Navigator
        initialRouteName="OnboardingIntro"
        screenOptions={screenOptions}
      >
        <Stack.Screen
          name="OnboardingIntro"
          component={OnboardingIntroScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="OnboardingIdentity"
          component={OnboardingIdentityScreen}
          options={{ title: "Create Device Identity" }}
        />
        <Stack.Screen
          name="OnboardingRegistry"
          component={OnboardingRegistryScreen}
          options={{ title: "Register Device" }}
        />
        <Stack.Screen
          name="Calibration"
          component={CalibrationScreen}
          options={{ title: "Calibrate Sensor" }}
        />
        <Stack.Screen
          name="MainTabs"
          component={TabNavigator}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
