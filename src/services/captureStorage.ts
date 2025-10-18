import * as FileSystem from "expo-file-system/legacy";
import type { CaptureReceipt } from "../types/capture";

const sanitizeAssetId = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]/g, "-");

const resolveBaseDirectory = (): string => {
  const base =
    FileSystem.documentDirectory ??
    FileSystem.cacheDirectory ??
    FileSystem.bundleDirectory ??
    "";
  return base.endsWith("/") ? base : `${base}/`;
};

export const getCaptureMetadataDirectory = (): string =>
  `${resolveBaseDirectory()}captures`;

export const ensureCaptureMetadataDirectory = async () => {
  const directory = getCaptureMetadataDirectory();
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
};

export const resolveReceiptPath = (assetId: string): string =>
  `${getCaptureMetadataDirectory()}/${sanitizeAssetId(assetId)}.json`;

export const writeReceiptToFile = async (
  receipt: CaptureReceipt
): Promise<CaptureReceipt> => {
  await ensureCaptureMetadataDirectory();
  const path = resolveReceiptPath(receipt.assetId);
  const payload: CaptureReceipt = {
    ...receipt,
    metadataPath: path,
  };
  await FileSystem.writeAsStringAsync(path, JSON.stringify(payload, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return payload;
};

export const loadReceiptFromFile = async (
  path: string
): Promise<CaptureReceipt | null> => {
  try {
    const contents = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const data = JSON.parse(contents) as CaptureReceipt;
    return {
      ...data,
      metadataPath: path,
    };
  } catch (error) {
    console.warn("Failed to load capture receipt", path, error);
    return null;
  }
};

export const listReceiptFiles = async (): Promise<string[]> => {
  const directory = getCaptureMetadataDirectory();
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists || !info.isDirectory) {
    return [];
  }
  const files = await FileSystem.readDirectoryAsync(directory);
  return files
    .filter((file) => file.endsWith(".json"))
    .map((file) => `${directory}/${file}`);
};
