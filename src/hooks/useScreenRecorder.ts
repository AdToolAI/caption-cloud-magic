import { useCallback, useEffect, useRef, useState } from "react";

export interface ScreenRecorderState {
  supported: boolean;
  recording: boolean;
  elapsed: number; // seconds
  error: string | null;
}

export interface UseScreenRecorderOptions {
  maxSeconds?: number;
  onComplete?: (file: File) => void;
}

export function useScreenRecorder(opts: UseScreenRecorderOptions = {}) {
  const { maxSeconds = 60, onComplete } = opts;
  const [state, setState] = useState<ScreenRecorderState>({
    supported: typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof (navigator.mediaDevices as MediaDevices).getDisplayMedia === "function" &&
      typeof window.MediaRecorder !== "undefined",
    recording: false,
    elapsed: 0,
    error: null,
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    if (stopTimerRef.current) { window.clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const stop = useCallback(() => {
    try { recorderRef.current?.stop(); } catch { /* noop */ }
  }, []);

  const start = useCallback(async () => {
    if (!state.supported) {
      setState((s) => ({ ...s, error: "Screen recording is not supported in this browser." }));
      return;
    }
    setState((s) => ({ ...s, error: null }));
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      streamRef.current = stream;
      chunksRef.current = [];

      // Pick best supported mime
      const candidates = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ];
      const mime = candidates.find((c) => MediaRecorder.isTypeSupported(c)) || "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || "video/webm";
        const ext = type.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `screen-recording-${Date.now()}.${ext}`, { type });
        cleanup();
        setState({ supported: true, recording: false, elapsed: 0, error: null });
        onComplete?.(file);
      };

      // Auto-stop when the user ends sharing from the browser UI
      stream.getVideoTracks()[0]?.addEventListener("ended", () => stop());

      rec.start(1000);
      setState((s) => ({ ...s, recording: true, elapsed: 0, error: null }));

      const startedAt = Date.now();
      tickRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setState((s) => ({ ...s, elapsed }));
      }, 250);
      stopTimerRef.current = window.setTimeout(() => stop(), maxSeconds * 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start recording.";
      cleanup();
      setState({ supported: true, recording: false, elapsed: 0, error: message });
    }
  }, [cleanup, maxSeconds, onComplete, state.supported, stop]);

  return { ...state, start, stop, maxSeconds };
}
