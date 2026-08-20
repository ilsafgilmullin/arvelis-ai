import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHAT_MESSAGE_MAX_CHARS } from '../domain/chatPolicy';
import { loadChatDraft, removeChatDraft, saveChatDraft } from '../lib/chatDraftStorage';

const DRAFT_SAVE_DELAY = 180;

export function useChatDraft(key: string) {
  const [value, setValueState] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const valueRef = useRef('');
  const keyRef = useRef(key);
  const timerRef = useRef<number | null>(null);

  const cancelScheduledSave = () => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const persist = (content: string) => {
    cancelScheduledSave();
    const saved = saveChatDraft(key, content);
    setSaveFailed(!saved);
    return saved;
  };

  const setValue = (content: string) => {
    const limited = content.slice(0, CHAT_MESSAGE_MAX_CHARS);
    valueRef.current = limited;
    setValueState(limited);
    cancelScheduledSave();
    timerRef.current = window.setTimeout(() => {
      const saved = saveChatDraft(keyRef.current, valueRef.current);
      setSaveFailed(!saved);
      timerRef.current = null;
    }, DRAFT_SAVE_DELAY);
  };

  const flush = () => {
    persist(valueRef.current);
  };

  const clear = () => {
    cancelScheduledSave();
    const removed = removeChatDraft(key);
    valueRef.current = '';
    setValueState('');
    setSaveFailed(!removed);
    return removed;
  };

  useLayoutEffect(() => {
    cancelScheduledSave();
    keyRef.current = key;
    const restored = loadChatDraft(key);
    valueRef.current = restored;
    setValueState(restored);
    setSaveFailed(false);

    return () => {
      cancelScheduledSave();
      saveChatDraft(key, valueRef.current);
    };
  }, [key]);

  useEffect(() => {
    const persistCurrentDraft = () => {
      cancelScheduledSave();
      saveChatDraft(keyRef.current, valueRef.current);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistCurrentDraft();
    };

    window.addEventListener('pagehide', persistCurrentDraft);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', persistCurrentDraft);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {
    value,
    setValue,
    saveFailed,
    flush,
    clear,
  };
}
