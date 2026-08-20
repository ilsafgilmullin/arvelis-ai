import { useRef } from 'react';
import { ArrowIcon, SendIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';
import { starterPrompts } from '../data/demo';
import { CHAT_MESSAGE_MAX_CHARS } from '../domain/chatPolicy';
import {
  conversationMessageCount,
  conversationMessageCountLabel,
  conversationRelativeTime,
} from '../domain/chatPresentation';
import { useChatDraft } from '../hooks/useChatDraft';
import { chatDraftKey } from '../lib/chatDraftStorage';
import type { DemoThread } from '../types';

const NEW_CHAT_DRAFT_KEY = chatDraftKey(null);

function dialogCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} диалог`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} диалога`;
  return `${count} диалогов`;
}

function greetingFor(profileName: string): string {
  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const normalized = profileName.trim();
  if (!normalized || normalized === 'Пользователь ARVELIS') return `${greeting}. Можно начинать.`;
  const firstName = normalized.split(/\s+/)[0] ?? normalized;
  return `${greeting}, ${firstName}. Можно начинать.`;
}

export function WorkspaceScreen({
  profileName,
  threads,
  threadLimitReached,
  onSubmit,
  onOpenThread,
}: {
  profileName: string;
  threads: DemoThread[];
  threadLimitReached: boolean;
  onSubmit: (prompt: string) => void;
  onOpenThread: (threadId: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    value: draft,
    setValue: setDraft,
    saveFailed: draftSaveFailed,
    flush: flushDraft,
    clear: clearDraft,
  } = useChatDraft(NEW_CHAT_DRAFT_KEY);

  const submit = () => {
    const prompt = draft.trim();
    if (!prompt || threadLimitReached) return;
    clearDraft();
    onSubmit(prompt);
  };

  const useScenario = (prompt: string) => {
    if (threadLimitReached) return;
    setDraft(prompt);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(prompt.length, prompt.length);
      textareaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  return (
    <div className="content-page">
      <Topbar title="ARVELIS AI" subtitle={greetingFor(profileName)} />

      <section className="workspace-hero">
        <div className="workspace-hero__copy">
          <p className="section-kicker workspace-welcome">ВАШ АССИСТЕНТ</p>
          <h2>С чего начнём?</h2>
          <p>Опишите задачу своими словами. Можно начать с цели, вопроса или просто контекста — ARVELIS AI создан, чтобы помогать двигаться от мысли к понятному результату.</p>
        </div>
        <div>
          <div className="composer composer--hero">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={flushDraft}
              placeholder="Например: помоги сравнить варианты, разобраться в теме или составить план…"
              aria-label="Описание задачи"
              rows={5}
              maxLength={CHAT_MESSAGE_MAX_CHARS}
              disabled={threadLimitReached}
            />
            <div className="composer__footer">
              <span>{draft.length.toLocaleString('ru-RU')} / {CHAT_MESSAGE_MAX_CHARS.toLocaleString('ru-RU')}</span>
              <button className="send-button" type="button" disabled={!draft.trim() || threadLimitReached} onClick={submit} aria-label="Создать тестовый диалог"><SendIcon /></button>
            </div>
          </div>
          {draftSaveFailed ? (
            <p className="workspace-draft-note" role="status">Черновик не удалось сохранить на устройстве.</p>
          ) : null}
          {threadLimitReached ? (
            <p className="workspace-limit-note" role="status">Локальная тестовая версия достигла лимита диалогов. Удалите ненужный диалог в «Истории», чтобы создать новый.</p>
          ) : null}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading"><p className="section-kicker">МОЖНО НАЧАТЬ ОТСЮДА</p><h2>Быстрые сценарии</h2></div>
        <div className="scenario-list">
          {starterPrompts.map((item) => (
            <button className="scenario-row" type="button" key={item.id} onClick={() => useScenario(item.prompt)} disabled={threadLimitReached}>
              <span className="scenario-row__index">{item.index}</span>
              <div><strong>{item.title}</strong><p>{item.description}</p></div>
              <ArrowIcon />
            </button>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading section-heading--inline"><div><p className="section-kicker">ПРОДОЛЖИТЬ</p><h2>Недавние диалоги</h2></div><span>{dialogCount(threads.length)}</span></div>
        {threads.length ? (
          <div className="history-list">
            {threads.slice(0, 4).map((thread) => {
              const conversationCount = conversationMessageCount(thread);
              return (
                <button className="history-row" type="button" key={thread.id} onClick={() => onOpenThread(thread.id)}>
                  <div><strong>{thread.title}</strong><span>{conversationMessageCountLabel(conversationCount)} · {conversationRelativeTime(thread.updatedAt)}</span></div>
                  <ArrowIcon />
                </button>
              );
            })}
          </div>
        ) : <div className="empty-inline">Пока здесь пусто. Первый диалог появится после вашей первой задачи.</div>}
      </section>
    </div>
  );
}
