import * as Device from "expo-device";
import { Platform } from "react-native";
import { getSupabaseClient } from "../lib/supabaseClient";
import { DeviceIdentity, isRegisteredLocally, markRegistered } from "./deviceIdentity";

type RegistrationMetadata = {
  manufacturer?: string | null;
  modelName?: string | null;
  modelId?: string | null;
  os?: string;
  osVersion?: string | null;
  isPhysicalDevice?: boolean;
};

const buildMetadata = (): RegistrationMetadata => ({
  manufacturer: Device.manufacturer ?? null,
  modelName: Device.modelName ?? null,
  modelId: Device.modelId ?? null,
  os: Platform.OS,
  osVersion: Device.osVersion ?? null,
  isPhysicalDevice: Device.isDevice ?? false,
});

export const registerDevice = async (identity: DeviceIdentity): Promise<void> => {
  const supabase = getSupabaseClient();

  const metadata = buildMetadata();
  const payload = {
    device_id: identity.deviceId,
    pubkey: identity.publicKey,
    device_model: metadata.modelName ?? "unknown",
    metadata,
  };

  const { error } = await supabase.from("devices").upsert(payload, {
    onConflict: "device_id",
  });

  if (error) {
    if (error.code === "42501") {
      throw new Error(
        'Supabase row-level security blocked this insert. Grant anon/authenticated write access with a policy like: `create policy "Allow device upserts" on devices for insert with check (true);`'
      );
    }

    throw error;
  }

  await markRegistered();
};

export const confirmRegistration = async (
  identity: DeviceIdentity
): Promise<boolean> => {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("devices")
      .select("device_id")
      .eq("device_id", identity.deviceId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data !== null;
  } catch (error) {
    console.warn("Unable to confirm device registration:", error);
    return isRegisteredLocally();
  }
};
