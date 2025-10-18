import { useCallback } from "react";
import { Alert } from "react-native";

type ConfirmationOptions = {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmationHandler = (options: ConfirmationOptions, onConfirm: () => void) => void;

export const useConfirmation = (): ConfirmationHandler => {
  return useCallback(
    (
      {
        title = "Are you sure?",
        message = "This action cannot be undone.",
        confirmLabel = "Confirm",
        cancelLabel = "Cancel",
      }: ConfirmationOptions,
      onConfirm: () => void
    ) => {
      Alert.alert(title, message, [
        {
          text: cancelLabel,
          style: "cancel",
        },
        {
          text: confirmLabel,
          style: "destructive",
          onPress: onConfirm,
        },
      ]);
    },
    []
  );
};

