import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearCalibrationFrames } from "../services/calibrationStorage";

export type FrameType = "flat" | "dark";

export type CapturedFrame = {
  id: string;
  type: FrameType;
  uri: string;
  hash: string;
  capturedAt: string;
  width?: number;
  height?: number;
};

type FrameInput = {
  uri: string;
  hash: string;
  width?: number;
  height?: number;
};

type CalibrationSessionValue = {
  flatFrames: CapturedFrame[];
  darkFrames: CapturedFrame[];
  fingerprintDescriptor: string | null;
  addFrame: (type: FrameType, frame: FrameInput) => void;
  resetSession: () => Promise<void>;
  setFingerprintDescriptor: (descriptor: string | null) => void;
};

const CalibrationSessionContext = createContext<CalibrationSessionValue | undefined>(undefined);

const createFrame = (type: FrameType, frame: FrameInput): CapturedFrame => ({
  id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type,
  uri: frame.uri,
  hash: frame.hash,
  width: frame.width,
  height: frame.height,
  capturedAt: new Date().toISOString(),
});

export const CalibrationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flatFrames, setFlatFrames] = useState<CapturedFrame[]>([]);
  const [darkFrames, setDarkFrames] = useState<CapturedFrame[]>([]);
  const [fingerprintDescriptor, setFingerprintDescriptor] = useState<string | null>(null);
  const hasInitialised = useRef(false);

  const addFrame = useCallback((type: FrameType, frame: FrameInput) => {
    const entry = createFrame(type, frame);
    if (type === "flat") {
      setFlatFrames((prev) => [...prev, entry]);
    } else {
      setDarkFrames((prev) => [...prev, entry]);
    }
  }, []);

  const resetSession = useCallback(async () => {
    await clearCalibrationFrames();
    setFlatFrames([]);
    setDarkFrames([]);
    setFingerprintDescriptor(null);
  }, []);

  useEffect(() => {
    if (!hasInitialised.current) {
      hasInitialised.current = true;
      resetSession().catch((err) => {
        console.warn("Failed to reset calibration session", err);
      });
    }
  }, [resetSession]);

  const value = useMemo(
    () => ({
      flatFrames,
      darkFrames,
      fingerprintDescriptor,
      addFrame,
      resetSession,
      setFingerprintDescriptor,
    }),
    [addFrame, darkFrames, fingerprintDescriptor, flatFrames, resetSession]
  );

  return (
    <CalibrationSessionContext.Provider value={value}>
      {children}
    </CalibrationSessionContext.Provider>
  );
};

export const useCalibrationSession = (): CalibrationSessionValue => {
  const ctx = useContext(CalibrationSessionContext);
  if (!ctx) {
    throw new Error("useCalibrationSession must be used within a CalibrationProvider");
  }
  return ctx;
};

