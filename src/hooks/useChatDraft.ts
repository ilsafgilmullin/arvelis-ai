import { useEffect, useRef, useState } from 'react';
import { CHAT_MESSAGE_MAX_CHARS } from '../domain/chatPolicy';
import { loadChatDraft, removeChatDraft, saveChatDraft } from '../lib/chatDraftStorage';

const DRAFT_SAVE_DELAY = 180;

export function useChatDraft(key: string) {
  const [value, setValueState] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const valueRef = useRef('');
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
      const saved = saveChatDraft(key, valueRef.current);
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

  useEffect(() => {
    cancelScheduledSave();
    const restored = loadChatDraft(key);
    valueRef.current = restored;
    setValueState(restored);
    setSaveFailed(false);

    return () => {
      cancelScheduledSave();
      saveChatDraft(key, valueRef.current);
    };
  }, [key]);

  return {
    value,
    setValue,
    saveFailed,
    flush,
    clear,
  };
}
