import { toByteArray } from "base64-js";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import nacl from "tweetnacl";
import {
  getSupabaseClient,
  isSupabaseConfigured,
} from "../lib/supabaseClient";
import type { CaptureReceipt } from "../types/capture";
import {
  listReceiptFiles,
  loadReceiptFromFile,
} from "./captureStorage";

export type SupabaseReceiptRow = {
  id?: string | null;
  asset_id: string;
  device_id: string;
  public_key: string;
  digest: string;
  signature: string;
  media_type: string | null;
  byte_length: number | null;
  signed_at: string | null;
  camera_facing: string | null;
  zoom: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  filename: string | null;
  asset_uri: string | null;
  metadata_path: string | null;
  extra: Record<string, unknown> | null;
  synced_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SupabaseDeviceRow = {
  device_id: string;
  pubkey: string | null;
  device_model: string | null;
  metadata: Record<string, unknown> | null;
  registered_at?: string | null;
};

export type VerificationVerdict =
  | "INITIAL"
  | "VERIFIED"
  | "STALE"
  | "SIGNATURE_INVALID"
  | "DIGEST_MISMATCH"
  | "MISSING_MEDIA"
  | "UNVERIFIABLE"
  | "ERROR";

export type VerificationReport = {
  assetId: string;
  supabaseReceipt: SupabaseReceiptRow;
  deviceRecord?: SupabaseDeviceRow | null;
  localReceipt: CaptureReceipt | null;
  localFileUri: string | null;
  digestMatches: boolean | null;
  signatureValid: boolean | null;
  verdict: VerificationVerdict;
  message: string;
};

export const fetchSupabaseReceipts = async (query: {
  assetId?: string;
  digest?: string;
  limit?: number;
}): Promise<SupabaseReceiptRow[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase credentials missing. Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const supabase = getSupabaseClient();
  let builder = supabase
    .from("device_receipt_signatures")
    .select("*")
    .order("signed_at", { ascending: false })
    .limit(query.limit ?? 20);

  if (query.assetId) {
    builder = builder.eq("asset_id", query.assetId);
  }

  if (query.digest) {
    builder = builder.eq("digest", query.digest);
  }

  const { data, error } = await builder;

  if (error) {
    throw error;
  }

  return (data ?? []) as SupabaseReceiptRow[];
};

export const fetchDeviceRecord = async (
  deviceId: string
): Promise<SupabaseDeviceRow | null> => {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase credentials missing. Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("devices")
    .select("device_id, pubkey, device_model, metadata, registered_at")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as SupabaseDeviceRow) ?? null;
};

const normalizeHex = (value: string) => value.trim().toLowerCase();

export const computeDigestForFile = async (uri: string): Promise<string> => {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    base64
  );
};

const readFileBytes = async (uri: string): Promise<Uint8Array> => {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return toByteArray(base64);
};

export const verifySignatureWithFile = async (params: {
  fileUri: string;
  signature: string;
  publicKey: string;
}): Promise<boolean> => {
  const bytes = await readFileBytes(params.fileUri);
  const signatureBytes = toByteArray(params.signature);
  const publicKeyBytes = toByteArray(params.publicKey);
  return nacl.sign.detached.verify(bytes, signatureBytes, publicKeyBytes);
};

export const verifySupabaseReceiptAgainstFile = async (
  receipt: SupabaseReceiptRow,
  fileUri: string
): Promise<{
  digest: string;
  digestMatches: boolean;
  signatureValid: boolean;
}> => {
  const digest = await computeDigestForFile(fileUri);
  const digestMatches =
    normalizeHex(digest) === normalizeHex(receipt.digest);
  const signatureValid = await verifySignatureWithFile({
    fileUri,
    signature: receipt.signature,
    publicKey: receipt.public_key,
  });

  return {
    digest,
    digestMatches,
    signatureValid,
  };
};

export const buildVerificationVerdict = (
  context: Pick<
    VerificationReport,
    "deviceRecord" | "digestMatches" | "signatureValid" | "localReceipt"
  >
): VerificationVerdict => {
  const deviceUnknown = context.deviceRecord === undefined;

  if (context.signatureValid === false) {
    return "SIGNATURE_INVALID";
  }
  if (context.digestMatches === false) {
    return "DIGEST_MISMATCH";
  }
  if (!context.localReceipt) {
    return "MISSING_MEDIA";
  }
  if (context.signatureValid && context.digestMatches) {
    if (context.deviceRecord) {
      return "VERIFIED";
    }
    if (!deviceUnknown) {
      return "STALE";
    }
    return "UNVERIFIABLE";
  }
  return "UNVERIFIABLE";
};

export const formatVerdictMessage = (
  verdict: VerificationVerdict
): string => {
  switch (verdict) {
    case "VERIFIED":
      return "Signature valid and device registry entry present.";
    case "STALE":
      return "Signature valid, but the device registry entry is missing.";
    case "SIGNATURE_INVALID":
      return "Stored signature failed verification with the supplied media.";
    case "DIGEST_MISMATCH":
      return "Computed file digest does not match the Supabase record.";
    case "MISSING_MEDIA":
      return "No local media file found to verify against.";
    case "UNVERIFIABLE":
      return "Supabase record located, but verification could not complete.";
    case "ERROR":
      return "Verification failed due to an unexpected error.";
    default:
      return "Awaiting verification.";
  }
};

export const loadLocalReceipts = async (): Promise<CaptureReceipt[]> => {
  const files = await listReceiptFiles();
  if (files.length === 0) {
    return [];
  }

  const receipts: CaptureReceipt[] = [];
  for (const path of files) {
    const receipt = await loadReceiptFromFile(path);
    if (receipt) {
      receipts.push(receipt);
    }
  }
  return receipts;
};

export const locateBestLocalReceipt = (
  receipts: CaptureReceipt[],
  target: { assetId?: string; digest?: string }
): CaptureReceipt | null => {
  if (target.assetId) {
    const direct = receipts.find((item) => item.assetId === target.assetId);
    if (direct) {
      return direct;
    }
  }

  if (target.digest) {
    const normalizedDigest = normalizeHex(target.digest);
    const byDigest = receipts.find(
      (item) => normalizeHex(item.digest) === normalizedDigest
    );
    if (byDigest) {
      return byDigest;
    }
  }

  return null;
};

export const verifySupabaseReceiptWithLocal = async (
  supabaseReceipt: SupabaseReceiptRow,
  localReceipt: CaptureReceipt | null
): Promise<Pick<VerificationReport, "digestMatches" | "signatureValid" | "localFileUri">> => {
  if (!localReceipt) {
    return {
      digestMatches: null,
      signatureValid: null,
      localFileUri: null,
    };
  }

  const candidateUri =
    localReceipt.sourceUri ??
    localReceipt.assetUri ??
    localReceipt.metadataPath ??
    null;

  if (!candidateUri) {
    return {
      digestMatches: null,
      signatureValid: null,
      localFileUri: null,
    };
  }

  const fileInfo = await FileSystem.getInfoAsync(candidateUri);
  if (!fileInfo.exists || fileInfo.isDirectory) {
    return {
      digestMatches: null,
      signatureValid: null,
      localFileUri: candidateUri,
    };
  }

  const digest = await computeDigestForFile(candidateUri);
  const digestMatches =
    normalizeHex(digest) === normalizeHex(supabaseReceipt.digest);

  const signatureValid = await verifySignatureWithFile({
    fileUri: candidateUri,
    signature: supabaseReceipt.signature,
    publicKey: supabaseReceipt.public_key,
  });

  return {
    digestMatches,
    signatureValid,
    localFileUri: candidateUri,
  };
};
