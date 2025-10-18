import { isSupabaseConfigured } from "../lib/supabaseClient";
import { clearIdentity, getStoredIdentity } from "./deviceIdentity";
import { removeDeviceRegistration } from "./deviceRegistry";
import { clearCalibrationData } from "./calibrationStorage";

type ResetOptions = {
  skipSupabase?: boolean;
};

export const resetOnboardingState = async (
  options?: ResetOptions
): Promise<void> => {
  const { skipSupabase = false } = options ?? {};
  const identity = await getStoredIdentity();
  let supabaseError: unknown = null;

  if (!skipSupabase && identity && isSupabaseConfigured()) {
    try {
      await removeDeviceRegistration(identity);
    } catch (error) {
      supabaseError = error;
    }
  }

  await clearIdentity();
  await clearCalibrationData();

  if (supabaseError) {
    throw supabaseError;
  }
};
