declare module "@expo/vector-icons/Ionicons" {
  import type { ComponentType } from "react";
  import type { TextProps } from "react-native";

  type IconProps = TextProps & {
    name: string;
    size?: number;
    color?: string;
  };

  const Ionicons: ComponentType<IconProps>;
  export default Ionicons;
}

