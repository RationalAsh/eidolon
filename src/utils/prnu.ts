import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { toByteArray } from "base64-js";
import jpeg from "jpeg-js";

import {
  CALIBRATION_MATRIX_SIZE,
  CALIBRATION_HEATMAP_GRID,
} from "../screens/calibration/constants";
import { loadCalibrationSample } from "../services/calibrationStorage";
import type { GrayscaleSample } from "../types/prnu";

const GAUSSIAN_KERNEL = [
  1, 2, 1,
  2, 4, 2,
  1, 2, 1,
];

const KERNEL_SUM = 16;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const yieldToEventLoop = async () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

const decodeGrayscaleSampleFromBuffer = (
  buffer: Uint8Array,
  targetSize: number = CALIBRATION_MATRIX_SIZE
): GrayscaleSample => {
  const decoded = jpeg.decode(buffer, { useTArray: true });

  if (!decoded || !decoded.data) {
    throw new Error("Unable to decode calibration frame.");
  }

  const { width, height, data } = decoded;
  const gray = new Float32Array(targetSize * targetSize);

  const xRatio = width / targetSize;
  const yRatio = height / targetSize;

  for (let y = 0; y < targetSize; y += 1) {
    const srcY = Math.min(Math.floor(y * yRatio), height - 1);
    for (let x = 0; x < targetSize; x += 1) {
      const srcX = Math.min(Math.floor(x * xRatio), width - 1);
      const srcIndex = (srcY * width + srcX) * 4;
      const r = data[srcIndex];
      const g = data[srcIndex + 1];
      const b = data[srcIndex + 2];
      gray[y * targetSize + x] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
  }

  return { width: targetSize, height: targetSize, data: gray };
};

export const createGrayscaleSampleFromBase64 = (
  base64: string,
  targetSize: number = CALIBRATION_MATRIX_SIZE
): GrayscaleSample => {
  const buffer = toByteArray(base64);
  return decodeGrayscaleSampleFromBuffer(buffer, targetSize);
};

export const loadGrayscaleSample = async (
  uri: string,
  targetSize: number = CALIBRATION_MATRIX_SIZE
): Promise<GrayscaleSample> => {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const buffer = toByteArray(base64);
  return decodeGrayscaleSampleFromBuffer(buffer, targetSize);
};

export const gaussianBlur3x3 = (
  input: Float32Array,
  width: number,
  height: number
): Float32Array => {
  const output = new Float32Array(input.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let kernelIndex = 0;

      for (let ky = -1; ky <= 1; ky += 1) {
        const iy = clamp(y + ky, 0, height - 1);

        for (let kx = -1; kx <= 1; kx += 1) {
          const ix = clamp(x + kx, 0, width - 1);
          const weight = GAUSSIAN_KERNEL[kernelIndex++];
          sum += input[iy * width + ix] * weight;
        }
      }

      output[y * width + x] = sum / KERNEL_SUM;
    }
  }

  return output;
};

export const computeResidual = (
  input: Float32Array,
  width: number,
  height: number
): Float32Array => {
  const blurred = gaussianBlur3x3(input, width, height);
  const residual = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    residual[i] = input[i] - blurred[i];
  }
  return residual;
};

export const normaliseVector = (input: Float32Array): Float32Array => {
  const output = new Float32Array(input.length);
  let mean = 0;
  for (let i = 0; i < input.length; i += 1) {
    mean += input[i];
  }
  mean /= input.length;

  let norm = 0;
  for (let i = 0; i < input.length; i += 1) {
    const value = input[i] - mean;
    output[i] = value;
    norm += value * value;
  }
  norm = Math.sqrt(norm);

  if (norm === 0) {
    return output;
  }

  for (let i = 0; i < output.length; i += 1) {
    output[i] /= norm;
  }
  return output;
};

export const subtractVectors = (
  a: Float32Array,
  b: Float32Array
): Float32Array => {
  const output = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    output[i] = a[i] - b[i];
  }
  return output;
};

export const addToAccumulator = (
  accumulator: Float32Array,
  vector: Float32Array
) => {
  for (let i = 0; i < accumulator.length; i += 1) {
    accumulator[i] += vector[i];
  }
};

export const scaleVector = (
  vector: Float32Array,
  scalar: number
): Float32Array => {
  const output = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) {
    output[i] = vector[i] * scalar;
  }
  return output;
};

export const computeCorrelation = (
  a: Float32Array,
  b: Float32Array
): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
};

export const fingerprintToHeatmap = (
  fingerprint: Float32Array,
  width: number,
  height: number,
  gridSize: number
): number[] => {
  const heatmap: number[] = [];
  const cellWidth = Math.floor(width / gridSize);
  const cellHeight = Math.floor(height / gridSize);

  for (let gy = 0; gy < gridSize; gy += 1) {
    for (let gx = 0; gx < gridSize; gx += 1) {
      let sum = 0;
      let count = 0;

      for (let y = 0; y < cellHeight; y += 1) {
        for (let x = 0; x < cellWidth; x += 1) {
          const ix = gx * cellWidth + x;
          const iy = gy * cellHeight + y;
          const index = iy * width + ix;
          if (index < fingerprint.length) {
            sum += Math.abs(fingerprint[index]);
            count += 1;
          }
        }
      }

      heatmap.push(count > 0 ? sum / count : 0);
    }
  }

  return heatmap;
};

const normaliseHeatmapValues = (heatmap: number[]): number[] => {
  if (heatmap.length === 0) {
    return heatmap;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < heatmap.length; i += 1) {
    const value = heatmap[i];
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-6) {
    return heatmap.map(() => 0.5);
  }

  return heatmap.map((value) => (value - min) / (max - min));
};

export type CalibrationFrameInput = {
  uri: string;
  hash: string;
  sampleUri?: string | null;
};

export type FingerprintComputationResult = {
  fingerprint: Float32Array;
  descriptor: string;
  heatmap: number[];
  correlations: number[];
  size: number;
};

const toArray = (vector: Float32Array) =>
  Array.from(vector).map((value) =>
    Math.round(value * 1_000_000) / 1_000_000
  );

const loadSampleForFrame = async (
  frame: CalibrationFrameInput,
  targetSize?: number
): Promise<GrayscaleSample> => {
  if (frame.sampleUri) {
    const sample = await loadCalibrationSample(frame.sampleUri);
    return sample;
  }

  return loadGrayscaleSample(frame.uri, targetSize);
};

export const computeFingerprintFromFrames = async (
  flatFrames: CalibrationFrameInput[],
  darkFrames: CalibrationFrameInput[]
): Promise<FingerprintComputationResult> => {
  if (flatFrames.length === 0 || darkFrames.length === 0) {
    throw new Error("Missing calibration frames. Capture both flat and dark samples.");
  }

  const firstFlat = await loadSampleForFrame(flatFrames[0]);
  const { width, height } = firstFlat;
  const vectorLength = width * height;

  const flatAccumulator = new Float32Array(vectorLength);
  const darkAccumulator = new Float32Array(vectorLength);

  const flatResiduals: Float32Array[] = [];

  const processFlatSample = (sample: GrayscaleSample) => {
    const residual = computeResidual(sample.data, width, height);
    addToAccumulator(flatAccumulator, residual);
    flatResiduals.push(normaliseVector(residual));
  };

  processFlatSample(firstFlat);

  for (let i = 1; i < flatFrames.length; i += 1) {
    const sample = await loadSampleForFrame(flatFrames[i], width);
    processFlatSample(sample);
    if ((i + 1) % 3 === 0) {
      await yieldToEventLoop();
    }
  }

  for (let i = 0; i < darkFrames.length; i += 1) {
    const sample = await loadSampleForFrame(darkFrames[i], width);
    const residual = computeResidual(sample.data, width, height);
    addToAccumulator(darkAccumulator, residual);
    if ((i + 1) % 3 === 0) {
      await yieldToEventLoop();
    }
  }

  const avgFlatResidual = scaleVector(flatAccumulator, 1 / flatFrames.length);
  const avgDarkResidual = scaleVector(darkAccumulator, 1 / darkFrames.length);
  const fingerprintRaw = subtractVectors(avgFlatResidual, avgDarkResidual);
  const fingerprint = normaliseVector(fingerprintRaw);

  const heatmap = fingerprintToHeatmap(
    fingerprint,
    width,
    height,
    Math.min(CALIBRATION_HEATMAP_GRID, width)
  );
  const normalisedHeatmap = normaliseHeatmapValues(heatmap);

  const correlations = flatResiduals.map((residual) =>
    computeCorrelation(residual, fingerprint)
  );

  const descriptorPayload = JSON.stringify({
    fingerprint: toArray(fingerprint),
    flat: flatFrames.map((frame) => frame.hash),
    dark: darkFrames.map((frame) => frame.hash),
  });

  const descriptor = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    descriptorPayload
  );

  return {
    fingerprint,
    descriptor,
    heatmap: normalisedHeatmap,
    correlations,
    size: width,
  };
};
