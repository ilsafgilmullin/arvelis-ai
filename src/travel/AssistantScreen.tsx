import { type FormEvent, useEffect, useState } from 'react';
import type { TravelAssistantContext, TravelAssistantUiStatus } from './assistantContext';

export function AssistantScreen({ context, message, status, online, onSubmit, onBackTrip, onCreateTrip }: {
  context: TravelAssistantContext;
  message: string;
  status: TravelAssistantUiStatus;
  online: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>, value: string) => void;
  onBackTrip?: () => void;
  onCreateTrip: () => void;
}) {
  const [draft, setDraft] = useState(message);
  useEffect(() => setDraft(message), [message, context]);

  const tripLabel = context.scope === 'trip' ? context.trip.destination ?? `Поездка из ${context.trip.origin}` : 'Общий travel assistant';

  return <main className="travel-page travel-assistant" data-assistant-scope={context.scope}>
    <div className="travel-assistant__heading"><div><p className="travel-kicker">ARVELIS AI</p><h1>{context.scope === 'trip' ? 'Ассистент поездки' : 'Travel Assistant'}</h1><span className="travel-context-pill">{tripLabel}</span></div>{onBackTrip ? <button className="travel-secondary travel-secondary--compact" type="button" onClick={onBackTrip}>Вернуться к поездке</button> : null}</div>
    <section className="travel-chat" aria-live="polite">{message ? <article className="travel-chat__message travel-chat__message--user"><span>Вы</span><p>{message}</p></article> : null}<AssistantStatus status={online ? status : 'offline'} onCreateTrip={onCreateTrip} /></section>
    <form className="travel-ai-composer travel-ai-composer--chat" onSubmit={(event) => onSubmit(event, draft)}>
      <label className="travel-sr-only" htmlFor="travel-assistant-prompt">Сообщение ARVELIS AI</label>
      <textarea id="travel-assistant-prompt" rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Опишите вопрос о путешествии…" />
      <div className="travel-ai-composer__footer"><span>Голос и вложения будут подключаться отдельными функциями</span><button className="travel-ai-send" type="submit" disabled={!draft.trim()} aria-label="Отправить запрос">→</button></div>
    </form>
  </main>;
}

function AssistantStatus({ status, onCreateTrip }: { status: TravelAssistantUiStatus; onCreateTrip: () => void }) {
  if (status === 'loading') return <div className="travel-ai-state is-loading" role="status"><span className="travel-ai-state__pulse" aria-hidden="true" /><div><strong>ARVELIS обрабатывает запрос</strong><p>Состояние загрузки готово для будущего AI Gateway.</p></div></div>;
  if (status === 'error') return <div className="travel-ai-state is-error" role="alert"><div><strong>Не удалось получить ответ</strong><p>Запрос не был завершён. Попробуйте снова после восстановления сервиса.</p></div></div>;
  if (status === 'offline') return <div className="travel-ai-state is-warning" role="status"><div><strong>Нет подключения к сети</strong><p>ARVELIS AI недоступен офлайн. Ваш текст не превращается в фиктивный ответ.</p></div></div>;
  if (status === 'provider_unavailable') return <div className="travel-ai-state is-warning" role="status"><div><strong>AI-провайдер временно недоступен</strong><p>ARVELIS не подменяет недоступный сервис демонстрационным ответом.</p></div></div>;
  if (status === 'not_connected') return <div className="travel-ai-state" role="status"><div><strong>ARVELIS AI пока не подключён</strong><p>Интерфейс и контекст готовы, но реальный AI Gateway не входит в этот этап. Ответы не генерируются и не имитируются.</p></div><button className="travel-secondary" type="button" onClick={onCreateTrip}>Создать поездку вручную</button></div>;
  if (status === 'user_message') return <div className="travel-ai-state" role="status"><div><strong>Сообщение сохранено в текущем интерфейсе</strong><p>Ответ появится только после подключения реального AI.</p></div></div>;
  return <div className="travel-ai-state travel-ai-state--empty" role="status"><div><strong>С чего начнём?</strong><p>Напишите, куда хотите поехать, какой бюджет планируете или что нужно проверить. Сейчас ARVELIS не отправляет запрос внешнему AI.</p></div></div>;
}
