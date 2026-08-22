import { useCallback, useEffect, useRef, useState } from 'react';

function chooseAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

export type VoiceRecordingResult = {
  blob: Blob;
  durationMs: number;
  mimeType: string;
};

export function useVoiceRecorder(onComplete: (result: VoiceRecordingResult) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    chunksRef.current = [];
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else {
      clearTimer();
      stopTracks();
      recorderRef.current = null;
      setRecording(false);
      setElapsedMs(0);
    }
  }, [clearTimer, stopTracks]);

  const start = useCallback(async () => {
    if (recording) return;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Запись голоса не поддерживается этим браузером.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = chooseAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      setElapsedMs(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setError('Не удалось записать голосовое сообщение.');
      };

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        const durationMs = Math.max(0, Date.now() - startedAtRef.current);
        const type = recorder.mimeType || mimeType || chunks[0]?.type || 'audio/webm';
        clearTimer();
        stopTracks();
        recorderRef.current = null;
        setRecording(false);
        setElapsedMs(0);

        if (!chunks.length) return;
        const blob = new Blob(chunks, { type });
        if (blob.size > 0) onCompleteRef.current({ blob, durationMs, mimeType: type });
      };

      recorder.start(250);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Math.max(0, Date.now() - startedAtRef.current));
      }, 250);
    } catch (caught) {
      stopTracks();
      recorderRef.current = null;
      setRecording(false);
      setElapsedMs(0);
      const name = caught instanceof DOMException ? caught.name : '';
      setError(name === 'NotAllowedError' ? 'Доступ к микрофону не разрешён.' : 'Не удалось включить микрофон.');
    }
  }, [clearTimer, recording, stopTracks]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && recorderRef.current?.state === 'recording') stop();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearTimer();
      if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
      stopTracks();
    };
  }, [clearTimer, stop, stopTracks]);

  return { recording, elapsedMs, error, start, stop, cancel } as const;
}
