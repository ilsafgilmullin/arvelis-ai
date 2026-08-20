import { useState } from 'react';
import { Topbar } from '../components/Topbar';
import type { SystemState } from '../types';

const content: Record<SystemState, { label: string; kicker: string; title: string; copy: string }> = {
  loading: { label: 'Загрузка', kicker: 'LOADING', title: 'Обработка запроса', copy: 'В рабочей версии здесь будет отображаться реальное состояние выполнения. Сейчас показан только UX-preview состояния.' },
  empty: { label: 'Пусто', kicker: 'EMPTY', title: 'Пока нет данных', copy: 'Пустое состояние должно объяснять причину и показывать следующий понятный шаг.' },
  error: { label: 'Ошибка', kicker: 'ERROR', title: 'Не удалось выполнить действие', copy: 'Ошибка не скрывается: пользователь получает понятное описание и безопасный способ продолжить работу.' },
  offline: { label: 'Офлайн', kicker: 'OFFLINE', title: 'Нет соединения', copy: 'Локальный интерфейс остаётся доступным, а сетевые функции блокируются до восстановления соединения.' },
  limit: { label: 'Лимит', kicker: 'LIMIT', title: 'Достигнут лимит', copy: 'Это только UX-preview. Тарифы, квоты и биллинг ARVELIS AI ещё не утверждены.' },
};

export function StatesScreen() {
  const [state, setState] = useState<SystemState>('loading');
  const selected = content[state];

  return (
    <div className="content-page">
      <Topbar title="Системные состояния" subtitle="Внутренний QA-экран frontend preview" />
      <div className="state-tabs" role="tablist" aria-label="Системные состояния">
        {(Object.keys(content) as SystemState[]).map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={state === item}
            key={item}
            className={state === item ? 'state-tab state-tab--active' : 'state-tab'}
            onClick={() => setState(item)}
          >
            {content[item].label}
          </button>
        ))}
      </div>
      <section className={`state-preview state-preview--${state}`}>
        <div className="state-preview__signal" aria-hidden="true" />
        <p className="section-kicker">{selected.kicker} · PREVIEW</p>
        <h2>{selected.title}</h2>
        <p>{selected.copy}</p>
      </section>
    </div>
  );
}
