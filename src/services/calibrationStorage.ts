import * as FileSystem from "expo-file-system/legacy";
import { fromByteArray, toByteArray } from "base64-js";
import type { GrayscaleSample } from "../types/prnu";

const ROOT_DIR = `${FileSystem.documentDirectory}eidolon-calibration/`;
const FRAMES_DIR = `${ROOT_DIR}frames/`;
const FINGERPRINT_FILE = `${ROOT_DIR}fingerprint.json`;

export type FingerprintRecord = {
  descriptor: string;
  createdAt: string;
  flatFrames: number;
  darkFrames: number;
  size: number;
  fingerprint: number[];
  correlations: number[];
  heatmap: number[];
};

const ensureDir = async (dir: string) => {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
};

export const clearCalibrationFrames = async () => {
  const info = await FileSystem.getInfoAsync(FRAMES_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(FRAMES_DIR, { idempotent: true });
  }
  const fingerprintInfo = await FileSystem.getInfoAsync(FINGERPRINT_FILE);
  if (fingerprintInfo.exists) {
    await FileSystem.deleteAsync(FINGERPRINT_FILE, { idempotent: true });
  }
};

export const clearCalibrationData = async () => {
  const info = await FileSystem.getInfoAsync(ROOT_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(ROOT_DIR, { idempotent: true });
  }
};

type PersistedFrameArtifacts = {
  imageUri: string;
  sampleUri: string;
};

export const persistCalibrationFrame = async (
  type: "flat" | "dark",
  sourceUri: string,
  sample: GrayscaleSample
): Promise<PersistedFrameArtifacts> => {
  await ensureDir(FRAMES_DIR);
  const extension = sourceUri.split(".").pop() ?? "jpg";
  const baseName = `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const imageUri = `${FRAMES_DIR}${baseName}.${extension}`;
  const sampleUri = `${FRAMES_DIR}${baseName}.sample.json`;

  await FileSystem.copyAsync({ from: sourceUri, to: imageUri });

  const serialized = JSON.stringify({
    width: sample.width,
    height: sample.height,
    data: fromByteArray(new Uint8Array(sample.data.buffer)),
  });

  await FileSystem.writeAsStringAsync(sampleUri, serialized, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return { imageUri, sampleUri };
};

export const loadCalibrationSample = async (
  sampleUri: string
): Promise<GrayscaleSample> => {
  const contents = await FileSystem.readAsStringAsync(sampleUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const parsed = JSON.parse(contents) as {
    width: number;
    height: number;
    data: string;
  };

  const byteArray = toByteArray(parsed.data);
  const buffer = byteArray.buffer.slice(
    byteArray.byteOffset,
    byteArray.byteOffset + byteArray.byteLength
  );
  const data = new Float32Array(buffer);

  return {
    width: parsed.width,
    height: parsed.height,
    data,
  };
};

export const saveFingerprintRecord = async (record: FingerprintRecord) => {
  await ensureDir(ROOT_DIR);
  await FileSystem.writeAsStringAsync(FINGERPRINT_FILE, JSON.stringify(record), {
    encoding: FileSystem.EncodingType.UTF8,
  });
};

export const loadFingerprintRecord = async (): Promise<FingerprintRecord | null> => {
  const info = await FileSystem.getInfoAsync(FINGERPRINT_FILE);
  if (!info.exists) {
    return null;
  }

  try {
    const contents = await FileSystem.readAsStringAsync(FINGERPRINT_FILE, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return JSON.parse(contents) as FingerprintRecord;
  } catch (error) {
    console.warn("Failed to parse fingerprint record", error);
    return null;
  }
};
