export type CaptureMode = "photo" | "video";

export type CaptureReceipt = {
  assetId: string;
  assetUri: string | null;
  mediaType: CaptureMode;
  digest: string;
  signature: string;
  deviceId: string;
  publicKey: string;
  byteLength: number;
  signedAt: string;
  sourceUri: string;
  metadataPath: string;
  cameraFacing: "front" | "back";
  zoom: number;
  width?: number;
  height?: number;
  duration?: number;
  filename?: string | null;
  syncedAt?: string | null;
  supabaseId?: string | null;
};
