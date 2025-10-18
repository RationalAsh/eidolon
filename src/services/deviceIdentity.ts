import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";

const PRIVATE_KEY_STORAGE_KEY = "eidolon:privateKey";
const PUBLIC_KEY_STORAGE_KEY = "eidolon:publicKey";
const DEVICE_ID_STORAGE_KEY = "eidolon:deviceId";
const REGISTRATION_FLAG_STORAGE_KEY = "eidolon:registered";

export type DeviceIdentity = {
  deviceId: string;
  publicKey: string;
  privateKey: string;
};

const getRandomBytes = (length: number) => {
  const bytes = new Uint8Array(length);
  Crypto.getRandomValues(bytes);
  return bytes;
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

export const getStoredIdentity = async (): Promise<DeviceIdentity | null> => {
  const [deviceId, publicKey, privateKey] = await Promise.all([
    SecureStore.getItemAsync(DEVICE_ID_STORAGE_KEY),
    SecureStore.getItemAsync(PUBLIC_KEY_STORAGE_KEY),
    SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY),
  ]);

  if (!deviceId || !publicKey || !privateKey) {
    return null;
  }

  return { deviceId, publicKey, privateKey };
};

export const ensureIdentity = async (): Promise<DeviceIdentity> => {
  const existing = await getStoredIdentity();
  if (existing) {
    return existing;
  }

  const seed = getRandomBytes(32);
  const keyPair = nacl.sign.keyPair.fromSeed(seed);
  const deviceId = `eidolon-${bytesToHex(getRandomBytes(8))}`;

  const privateKey = encodeBase64(keyPair.secretKey);
  const publicKey = encodeBase64(keyPair.publicKey);

  await Promise.all([
    SecureStore.setItemAsync(DEVICE_ID_STORAGE_KEY, deviceId),
    SecureStore.setItemAsync(PUBLIC_KEY_STORAGE_KEY, publicKey),
    SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_KEY, privateKey),
    SecureStore.deleteItemAsync(REGISTRATION_FLAG_STORAGE_KEY),
  ]);

  return { deviceId, publicKey, privateKey };
};

export const clearIdentity = async () => {
  await Promise.all([
    SecureStore.deleteItemAsync(DEVICE_ID_STORAGE_KEY),
    SecureStore.deleteItemAsync(PUBLIC_KEY_STORAGE_KEY),
    SecureStore.deleteItemAsync(PRIVATE_KEY_STORAGE_KEY),
    SecureStore.deleteItemAsync(REGISTRATION_FLAG_STORAGE_KEY),
  ]);
};

export const markRegistered = async () => {
  await SecureStore.setItemAsync(REGISTRATION_FLAG_STORAGE_KEY, "true");
};

export const isRegisteredLocally = async (): Promise<boolean> => {
  const flag = await SecureStore.getItemAsync(REGISTRATION_FLAG_STORAGE_KEY);
  return flag === "true";
};

export const getPublicKeyFingerprint = async (publicKey: string) => {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    publicKey
  );
};

