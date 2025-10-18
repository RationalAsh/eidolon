import {
  createNativeStackNavigator,
  NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import FlatFrameScreen from "./FlatFrameScreen";
import DarkFrameScreen from "./DarkFrameScreen";
import ProcessingScreen from "./ProcessingScreen";
import { CalibrationProvider } from "../../context/CalibrationSessionContext";

export type CalibrationStackParamList = {
  CalibrationFlat: undefined;
  CalibrationDark: { flatFramesCaptured: number };
  CalibrationProcess: {
    flatFramesCaptured: number;
    darkFramesCaptured: number;
  };
};

const Stack = createNativeStackNavigator<CalibrationStackParamList>();

const screenOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: "#0f1624" },
  headerTintColor: "#f1f4fa",
  headerTitleStyle: { fontWeight: "700" },
  contentStyle: { backgroundColor: "#050b14" },
};

const CalibrationNavigator: React.FC = () => {
  return (
    <CalibrationProvider>
      <Stack.Navigator
        initialRouteName="CalibrationFlat"
        screenOptions={screenOptions}
      >
        <Stack.Screen
          name="CalibrationFlat"
          component={FlatFrameScreen}
          options={{ title: "Calibrate: Flat Frames" }}
        />
        <Stack.Screen
          name="CalibrationDark"
          component={DarkFrameScreen}
          options={{ title: "Calibrate: Dark Frames" }}
        />
        <Stack.Screen
          name="CalibrationProcess"
          component={ProcessingScreen}
          options={{ title: "Processing PRNU" }}
        />
      </Stack.Navigator>
    </CalibrationProvider>
  );
};

export default CalibrationNavigator;
