import { type FormEvent, useEffect, useState } from 'react';
import type { TravelAssistantContext, TravelAssistantUiStatus } from './assistantContext';
import { STARTER_PROMPTS } from './ui';

export function AssistantScreen({ context, messages, status, online, onSubmit, onBackTrip, onCreateTrip, onOpenTrips }: {
  context: TravelAssistantContext;
  messages: string[];
  status: TravelAssistantUiStatus;
  online: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>, value: string) => boolean;
  onBackTrip?: () => void;
  onCreateTrip: () => void;
  onOpenTrips: () => void;
}) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft('');
  }, [context]);

  const tripLabel = context.scope === 'trip'
    ? context.trip.destination ?? `Поездка из ${context.trip.origin}`
    : 'Общий режим';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    const accepted = onSubmit(event, draft);
    if (accepted) setDraft('');
  };

  return <main className="travel-page travel-assistant" data-assistant-scope={context.scope}>
    <header className="travel-assistant__heading">
      <div>
        <p className="travel-kicker">ARVELIS AI</p>
        <h1>Ассистент путешествий</h1>
        <span className="travel-context-pill">{tripLabel}</span>
      </div>
      {onBackTrip ? <button className="travel-secondary travel-secondary--compact" type="button" onClick={onBackTrip}>Вернуться к поездке</button> : null}
    </header>

    <section className="travel-chat-workspace" aria-label="Диалог с ARVELIS AI">
      <div className="travel-chat" aria-live="polite">
        {messages.length === 0 ? <div className="travel-chat__welcome">
          <div className="travel-chat__welcome-icon" aria-hidden="true">A</div>
          <h2>Чем помочь с путешествием?</h2>
          <p>Расскажите, куда хотите поехать, какой бюджет планируете или что нужно проверить.</p>
          <div className="travel-starter-prompts travel-starter-prompts--chat" aria-label="Примеры запросов">
            {STARTER_PROMPTS.map((starter) => <button type="button" key={starter} onClick={() => setDraft(starter)}>{starter}</button>)}
          </div>
          {context.scope === 'general' ? <div className="travel-chat__quick-actions">
            <button className="travel-secondary" type="button" onClick={onCreateTrip}>Создать поездку</button>
            <button className="travel-link" type="button" onClick={onOpenTrips}>Мои поездки</button>
          </div> : null}
        </div> : messages.map((message, index) => <article className="travel-chat__message travel-chat__message--user" key={`${index}-${message}`}>
          <span>Вы</span><p>{message}</p>
        </article>)}

        <AssistantStatus status={online ? status : 'offline'} />
      </div>

      <form className="travel-ai-composer travel-ai-composer--chat" onSubmit={submit}>
        <label className="travel-sr-only" htmlFor="travel-assistant-prompt">Сообщение ARVELIS AI</label>
        <textarea id="travel-assistant-prompt" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Напишите сообщение…" enterKeyHint="send" />
        <div className="travel-ai-composer__footer">
          <span>Сообщение</span>
          <button className="travel-ai-send" type="submit" disabled={!draft.trim()} aria-label="Отправить запрос">→</button>
        </div>
      </form>
    </section>
  </main>;
}

function AssistantStatus({ status }: { status: TravelAssistantUiStatus }) {
  if (status === 'loading') return <div className="travel-ai-notice" role="status"><span className="travel-ai-state__pulse" aria-hidden="true" /><p>Обрабатываем запрос…</p></div>;
  if (status === 'error') return <div className="travel-ai-notice is-error" role="alert"><p>Не удалось обработать запрос.</p></div>;
  if (status === 'offline') return <div className="travel-ai-notice is-warning" role="status"><p>Нет подключения к сети.</p></div>;
  if (status === 'provider_unavailable' || status === 'not_connected' || status === 'user_message') {
    return <div className="travel-ai-notice" role="status"><p>AI-планирование пока не подключено.</p></div>;
  }
  return <div className="travel-ai-notice" role="status"><p>AI-планирование пока не подключено.</p></div>;
}
