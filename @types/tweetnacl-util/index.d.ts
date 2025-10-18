declare module "tweetnacl-util" {
  export function encodeBase64(array: Uint8Array): string;
  export function decodeBase64(base64: string): Uint8Array;
  export function encodeUTF8(array: Uint8Array): string;
  export function decodeUTF8(text: string): Uint8Array;
}

