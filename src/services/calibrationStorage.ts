import * as FileSystem from "expo-file-system/legacy";

const ROOT_DIR = `${FileSystem.documentDirectory}eidolon-calibration/`;
const FRAMES_DIR = `${ROOT_DIR}frames/`;
const FINGERPRINT_FILE = `${ROOT_DIR}fingerprint.json`;

export type FingerprintRecord = {
  descriptor: string;
  createdAt: string;
  flatFrames: number;
  darkFrames: number;
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
};

export const clearCalibrationData = async () => {
  const info = await FileSystem.getInfoAsync(ROOT_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(ROOT_DIR, { idempotent: true });
  }
};

export const saveCalibrationFrameFile = async (
  type: "flat" | "dark",
  sourceUri: string
): Promise<string> => {
  await ensureDir(FRAMES_DIR);
  const extension = sourceUri.split(".").pop() ?? "jpg";
  const targetUri = `${FRAMES_DIR}${type}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${extension}`;
  await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  return targetUri;
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
