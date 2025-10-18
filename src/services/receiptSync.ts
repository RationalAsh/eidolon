import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabaseClient";
import type { CaptureReceipt } from "../types/capture";
import {
  listReceiptFiles,
  loadReceiptFromFile,
  writeReceiptToFile,
} from "./captureStorage";

export type ReceiptSyncReport = {
  uploaded: number;
  skipped: number;
  errors: number;
  lastError?: string;
};

const buildUploadPayload = (receipt: CaptureReceipt) => {
  const base = {
    asset_id: receipt.assetId,
    device_id: receipt.deviceId,
    media_type: receipt.mediaType,
    digest: receipt.digest,
    signature: receipt.signature,
    public_key: receipt.publicKey,
    byte_length: receipt.byteLength,
    signed_at: receipt.signedAt,
    asset_uri: receipt.assetUri,
    metadata_path: receipt.metadataPath,
    camera_facing: receipt.cameraFacing,
    zoom: receipt.zoom,
    width: receipt.width ?? null,
    height: receipt.height ?? null,
    duration: receipt.duration ?? null,
    filename: receipt.filename ?? null,
    extra: {
      source_uri: receipt.sourceUri,
    },
  };

  return base;
};

export const syncReceiptsToSupabase = async (): Promise<ReceiptSyncReport> => {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase credentials missing. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const supabase = getSupabaseClient();
  const files = await listReceiptFiles();
  const report: ReceiptSyncReport = {
    uploaded: 0,
    skipped: 0,
    errors: 0,
  };

  for (const path of files) {
    const receipt = await loadReceiptFromFile(path);
    if (!receipt) {
      report.errors += 1;
      report.lastError = `Unable to read receipt at ${path}`;
      continue;
    }

    if (receipt.syncedAt) {
      report.skipped += 1;
      continue;
    }

    try {
      const payload = buildUploadPayload(receipt);
      const syncedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("device_receipt_signatures")
        .upsert({ ...payload, synced_at: syncedAt }, { onConflict: "asset_id" })
        .select();

      if (error) {
        throw error;
      }

      const supabaseId =
        Array.isArray(data) && data.length > 0
          ? (data[0] as { id?: string; asset_id?: string }).id ??
            (data[0] as { asset_id?: string }).asset_id ??
            null
          : null;

      const updated: CaptureReceipt = {
        ...receipt,
        supabaseId: supabaseId ?? receipt.assetId,
        syncedAt,
      };

      await writeReceiptToFile(updated);
      report.uploaded += 1;
    } catch (error) {
      console.warn("Failed to sync receipt", receipt.assetId, error);
      report.errors += 1;
      report.lastError =
        error instanceof Error ? error.message : "Unknown Supabase error during receipt sync.";
    }
  }

  return report;
};
