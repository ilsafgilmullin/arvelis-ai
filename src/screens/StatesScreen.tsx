import { useState } from 'react';
import { Topbar } from '../components/Topbar';
import type { SystemState } from '../types';

const content: Record<SystemState, { kicker: string; title: string; copy: string }> = {
  loading: { kicker: 'LOADING', title: 'Обработка запроса', copy: 'В production здесь будет отображаться реальное состояние выполнения. Сейчас показана только анимация UX-состояния.' },
  empty: { kicker: 'EMPTY', title: 'Пока нет данных', copy: 'Пустое состояние должно объяснять, почему здесь ничего нет, и предлагать следующий понятный шаг.' },
  error: { kicker: 'ERROR', title: 'Не удалось выполнить действие', copy: 'Ошибка не должна скрываться. Пользователь получает понятное описание и безопасный способ продолжить работу.' },
  offline: { kicker: 'OFFLINE', title: 'Нет соединения', copy: 'Локальный интерфейс остаётся доступным, а сетевые функции блокируются до восстановления соединения.' },
  limit: { kicker: 'LIMIT', title: 'Достигнут лимит', copy: 'Это только UX-пример. Тарифы, квоты и биллинг ARVELIS AI ещё не утверждены.' },
};

export function StatesScreen() {
  const [state, setState] = useState<SystemState>('loading');
  const selected = content[state];

  return (
    <div className="content-page">
      <Topbar title="Системные состояния" subtitle="Внутренний экран UX-проверки. Все примеры демонстрационные." />
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
            {item}
          </button>
        ))}
      </div>
      <section className={`state-preview state-preview--${state}`}>
        <div className="state-preview__signal" aria-hidden="true" />
        <p className="section-kicker">{selected.kicker} · DEMO</p>
        <h2>{selected.title}</h2>
        <p>{selected.copy}</p>
      </section>
    </div>
  );
}
