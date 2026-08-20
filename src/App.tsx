import { ChangeEvent, FormEvent, ReactNode, useMemo, useState } from 'react';

type Screen = 'welcome' | 'auth' | 'workspace' | 'chat' | 'history' | 'profile' | 'states';
type DemoState = 'loading' | 'empty' | 'error' | 'offline' | 'limit';

type NavItem = {
  id: Screen;
  label: string;
  shortLabel: string;
  icon: ReactNode;
};

const Icon = ({ children }: { children: ReactNode }) => (
  <span className="icon" aria-hidden="true">{children}</span>
);

const HomeIcon = () => <Icon><svg viewBox="0 0 24 24"><path d="M3.5 10.5 12 3l8.5 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5a1.5 1.5 0 0 1-1.5-1.5z" /></svg></Icon>;
const ChatIcon = () => <Icon><svg viewBox="0 0 24 24"><path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.8 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /></svg></Icon>;
const HistoryIcon = () => <Icon><svg viewBox="0 0 24 24"><path d="M4.5 7.5V3.8M4.5 3.8h3.7M4.5 3.8a9 9 0 1 1-1.4 10.7" /><path d="M12 7.5V12l3 1.8" /></svg></Icon>;
const ProfileIcon = () => <Icon><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6" /></svg></Icon>;
const StateIcon = () => <Icon><svg viewBox="0 0 24 24"><path d="M4 12h3l2-5 4 10 2-5h5" /></svg></Icon>;
const ArrowIcon = () => <Icon><svg viewBox="0 0 24 24"><path d="m8 5 7 7-7 7" /></svg></Icon>;
const PlusIcon = () => <Icon><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></Icon>;
const SendIcon = () => <Icon><svg viewBox="0 0 24 24"><path d="m4 4 16 8-16 8 3-8z" /><path d="M7 12h13" /></svg></Icon>;

const navItems: NavItem[] = [
  { id: 'workspace', label: 'Рабочее пространство', shortLabel: 'Главная', icon: <HomeIcon /> },
  { id: 'chat', label: 'Чат', shortLabel: 'Чат', icon: <ChatIcon /> },
  { id: 'history', label: 'История', shortLabel: 'История', icon: <HistoryIcon /> },
  { id: 'profile', label: 'Профиль', shortLabel: 'Профиль', icon: <ProfileIcon /> },
];

const demoThreads = [
  { title: 'Структура плана проекта', meta: 'Сегодня · 10:14' },
  { title: 'Разбор учебного материала', meta: 'Сегодня · 09:31' },
  { title: 'Сравнение двух решений', meta: 'Вчера · 22:08' },
  { title: 'Подготовка делового текста', meta: 'Вчера · 18:44' },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'brand brand--compact' : 'brand'} aria-label="ARVELIS AI">
      <svg className="brand__mark" viewBox="0 0 120 120" role="img" aria-label="ARVELIS AI mark">
        <defs>
          <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f0cf74" />
            <stop offset="0.45" stopColor="#d5a842" />
            <stop offset="1" stopColor="#9d6d20" />
          </linearGradient>
        </defs>
        <path className="brand__orbit" d="M59 10a50 50 0 0 0 0 100" />
        <g className="brand__dots">
          {[0,1,2,3,4,5,6,7,8,9,10].map((i) => {
            const angle = (-72 + i * 14.4) * Math.PI / 180;
            const r = 50;
            const cx = 60 + Math.cos(angle) * r;
            const cy = 60 + Math.sin(angle) * r;
            return <circle key={i} cx={cx} cy={cy} r={1.6 + i * 0.08} />;
          })}
        </g>
        <path className="brand__a" d="M35 84 57 29h9l22 55H75L61.5 48 48 84Zm18-20h17l4 10H49Z" fillRule="evenodd" />
      </svg>
      {!compact && (
        <div className="brand__wordmark">
          <strong>ARVELIS</strong>
          <span><i />AI<i /></span>
        </div>
      )}
    </div>
  );
}

function DemoNotice() {
  return (
    <div className="demo-notice" role="status">
      <span className="demo-notice__badge">DEMO</span>
      <span>Интерфейс-прототип. AI, авторизация и серверное хранение пока не подключены.</span>
    </div>
  );
}

function Welcome({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  return (
    <main className="welcome-shell">
      <DemoNotice />
      <section className="welcome-card">
        <BrandMark />
        <p className="eyebrow">INTELLIGENCE. PRECISION. RESULTS.</p>
        <h1>Профессиональный интеллект для сложных задач.</h1>
        <p className="welcome-copy">Работа, учёба и повседневные решения — в одном строгом рабочем пространстве.</p>
        <div className="welcome-actions">
          <button className="button button--primary" onClick={onStart}>Открыть демо</button>
          <button className="button button--ghost" onClick={onLogin}>Экран входа</button>
        </div>
        <p className="microcopy">Данные из демо-режима не отправляются в AI и не сохраняются на сервере.</p>
      </section>
    </main>
  );
}

function Auth({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onContinue();
  };

  return (
    <main className="auth-shell">
      <DemoNotice />
      <section className="auth-card">
        <button className="text-button" onClick={onBack}>← Назад</button>
        <div className="auth-brand"><BrandMark compact /><span>ARVELIS AI</span></div>
        <div>
          <p className="section-kicker">ДЕМОНСТРАЦИОННЫЙ ЭКРАН</p>
          <h1>Вход в рабочее пространство</h1>
          <p className="muted">Форма визуальная: настоящая авторизация ещё не подключена.</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Email<input type="email" placeholder="name@example.com" autoComplete="email" /></label>
          <label>Пароль<input type="password" placeholder="••••••••" autoComplete="current-password" /></label>
          <button className="button button--primary" type="submit">Продолжить в демо</button>
        </form>
      </section>
    </main>
  );
}

function Sidebar({ screen, onNavigate }: { screen: Screen; onNavigate: (screen: Screen) => void }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <div className="sidebar__brand"><BrandMark compact /><span>ARVELIS <small>AI</small></span></div>
        <button className="new-chat" onClick={() => onNavigate('chat')}><PlusIcon />Новый чат</button>
        <nav className="sidebar__nav" aria-label="Основная навигация">
          {navItems.map((item) => (
            <button key={item.id} className={screen === item.id ? 'nav-item nav-item--active' : 'nav-item'} onClick={() => onNavigate(item.id)}>{item.icon}<span>{item.label}</span></button>
          ))}
          <button className={screen === 'states' ? 'nav-item nav-item--active' : 'nav-item'} onClick={() => onNavigate('states')}><StateIcon /><span>Состояния DEMO</span></button>
        </nav>
      </div>
      <div className="sidebar__footer">
        <span className="status-dot" />
        <div><strong>Prototype</strong><span>Локальный demo-режим</span></div>
      </div>
    </aside>
  );
}

function MobileNav({ screen, onNavigate }: { screen: Screen; onNavigate: (screen: Screen) => void }) {
  return (
    <nav className="mobile-nav" aria-label="Мобильная навигация">
      {navItems.map((item) => (
        <button key={item.id} className={screen === item.id ? 'mobile-nav__item mobile-nav__item--active' : 'mobile-nav__item'} onClick={() => onNavigate(item.id)}>{item.icon}<span>{item.shortLabel}</span></button>
      ))}
    </nav>
  );
}

function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="topbar">
      <div>
        <span className="topbar__mobile-brand">ARVELIS AI</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <span className="demo-chip">DEMO</span>
    </header>
  );
}

function Workspace({ onOpenChat }: { onOpenChat: () => void }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="content-page">
      <Topbar title="Рабочее пространство" subtitle="Сформулируйте задачу — структура и приоритеты останутся в центре внимания." />
      <section className="hero-panel">
        <p className="section-kicker">ARVELIS WORKSPACE</p>
        <h2>Какую задачу нужно решить?</h2>
        <p>Демонстрационный composer показывает будущий основной сценарий. Сообщение пока никуда не отправляется.</p>
        <div className="composer composer--hero">
          <textarea value={draft} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)} placeholder="Опишите задачу, контекст и желаемый результат…" rows={4} />
          <div className="composer__footer">
            <span>DEMO · без отправки данных</span>
            <button className="send-button" onClick={onOpenChat} aria-label="Открыть демонстрационный чат"><SendIcon /></button>
          </div>
        </div>
      </section>
      <section className="section-block">
        <div className="section-heading"><div><p className="section-kicker">БЫСТРЫЙ СТАРТ</p><h2>Типовые задачи</h2></div></div>
        <div className="task-list">
          {[
            ['Работа', 'Анализ, документы, планирование и профессиональные тексты'],
            ['Учёба', 'Объяснение, структурирование материала и подготовка'],
            ['Повседневные задачи', 'Сравнение вариантов, решения и понятные инструкции'],
          ].map(([title, copy]) => (
            <button key={title} className="task-row" onClick={onOpenChat}><div><strong>{title}</strong><span>{copy}</span></div><ArrowIcon /></button>
          ))}
        </div>
      </section>
      <section className="section-block">
        <div className="section-heading"><div><p className="section-kicker">ПОСЛЕДНЕЕ</p><h2>История демо</h2></div></div>
        <div className="history-table">{demoThreads.slice(0, 3).map((thread) => <button key={thread.title} onClick={onOpenChat}><span>{thread.title}</span><small>{thread.meta}</small></button>)}</div>
      </section>
    </div>
  );
}

function Chat() {
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const send = () => {
    if (!message.trim()) return;
    setSent(true);
    setMessage('');
  };

  return (
    <div className="chat-page">
      <Topbar title="Разбор задачи" subtitle="Демонстрационный диалог без подключения к AI." />
      <div className="chat-thread" aria-live="polite">
        <div className="message message--user">
          <span className="message__label">ВЫ · DEMO</span>
          <p>Помоги структурировать сложную задачу: выдели цель, ограничения, риски и следующие действия.</p>
        </div>
        <div className="message message--assistant">
          <div className="assistant-heading"><BrandMark compact /><span>ARVELIS AI · DEMO RESPONSE</span></div>
          <p>Ниже показан пример будущей структуры ответа. Это заранее подготовленный mock, а не результат работы AI.</p>
          <div className="answer-grid">
            <div><span>01</span><strong>Цель</strong><p>Сформулировать конечный измеримый результат без расширения исходной задачи.</p></div>
            <div><span>02</span><strong>Ограничения</strong><p>Отделить обязательные требования от предположений и второстепенных пожеланий.</p></div>
            <div><span>03</span><strong>Риски</strong><p>Проверить зависимости, стоимость ошибки и действия, требующие подтверждения.</p></div>
            <div><span>04</span><strong>Следующий шаг</strong><p>Выбрать одно безопасное действие, которое приближает к результату и легко проверить.</p></div>
          </div>
        </div>
        {sent && <div className="message message--user"><span className="message__label">ВЫ · ЛОКАЛЬНОЕ DEMO</span><p>Сообщение добавлено только в локальное состояние интерфейса.</p></div>}
      </div>
      <div className="chat-composer-wrap">
        <div className="composer">
          <textarea value={message} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)} placeholder="Сообщение…" rows={1} />
          <button className="send-button" onClick={send} aria-label="Добавить локальное demo-сообщение"><SendIcon /></button>
        </div>
        <p className="composer-note">DEMO: сообщения не отправляются на сервер и не обрабатываются AI.</p>
      </div>
    </div>
  );
}

function History({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="content-page">
      <Topbar title="История" subtitle="Пример будущего списка диалогов. Все записи ниже — mock-данные." />
      <section className="section-block section-block--flush">
        <div className="search-field"><span>⌕</span><input placeholder="Поиск по истории (demo)" /></div>
        <div className="history-table history-table--large">{demoThreads.map((thread) => <button key={thread.title} onClick={onOpen}><span>{thread.title}<small>DEMO RECORD</small></span><small>{thread.meta}</small></button>)}</div>
      </section>
    </div>
  );
}

function Profile() {
  return (
    <div className="content-page">
      <Topbar title="Профиль и настройки" subtitle="Настройки пока визуальные и не сохраняются на сервере." />
      <section className="profile-card">
        <div className="avatar">A</div>
        <div><p className="section-kicker">DEMO PROFILE</p><h2>Пользователь ARVELIS</h2><span>Локальный прототип</span></div>
      </section>
      <section className="settings-list">
        {[
          ['Интерфейс', 'Тёмная графитово-золотая тема — зафиксирована для прототипа'],
          ['Конфиденциальность', 'Серверное хранение ещё не подключено'],
          ['Память', 'Функция не реализована и не имитируется'],
          ['Уведомления', 'Не подключены'],
        ].map(([title, copy]) => <div className="setting-row" key={title}><div><strong>{title}</strong><span>{copy}</span></div><span className="setting-status">DEMO</span></div>)}
      </section>
    </div>
  );
}

function StateCard({ state }: { state: DemoState }) {
  const content = useMemo(() => ({
    loading: ['Обработка', 'В будущем здесь будет отображаться реальное состояние запроса. Сейчас это визуальная демонстрация.'],
    empty: ['Пока нет данных', 'Создайте первый диалог после подключения реального хранения.'],
    error: ['Не удалось выполнить действие', 'Пользователь увидит понятную причину и безопасный вариант повторить запрос.'],
    offline: ['Нет соединения', 'Интерфейс должен сохранять контекст и корректно сообщать о недоступности сети.'],
    limit: ['Достигнут лимит', 'Лимит показан только как UX-состояние. Тарифы и биллинг пока не утверждены.'],
  })[state], [state]);

  return (
    <div className={`state-preview state-preview--${state}`}>
      <span className="state-preview__signal" />
      <p className="section-kicker">{state.toUpperCase()} · DEMO</p>
      <h2>{content[0]}</h2>
      <p>{content[1]}</p>
      {state !== 'loading' && <button className="button button--ghost">Демонстрационное действие</button>}
    </div>
  );
}

function States() {
  const [state, setState] = useState<DemoState>('loading');
  return (
    <div className="content-page">
      <Topbar title="Системные состояния" subtitle="Dev/UX-экран для проверки обязательных состояний интерфейса." />
      <div className="state-tabs">{(['loading','empty','error','offline','limit'] as DemoState[]).map((item) => <button key={item} className={state === item ? 'state-tab state-tab--active' : 'state-tab'} onClick={() => setState(item)}>{item}</button>)}</div>
      <StateCard state={state} />
    </div>
  );
}

function AppShell() {
  const [screen, setScreen] = useState<Screen>('workspace');
  return (
    <div className="app-shell">
      <Sidebar screen={screen} onNavigate={setScreen} />
      <div className="app-main">
        {screen === 'workspace' && <Workspace onOpenChat={() => setScreen('chat')} />}
        {screen === 'chat' && <Chat />}
        {screen === 'history' && <History onOpen={() => setScreen('chat')} />}
        {screen === 'profile' && <Profile />}
        {screen === 'states' && <States />}
      </div>
      <MobileNav screen={screen} onNavigate={setScreen} />
    </div>
  );
}

export default function App() {
  const [entry, setEntry] = useState<'welcome' | 'auth' | 'app'>('welcome');
  if (entry === 'welcome') return <Welcome onStart={() => setEntry('app')} onLogin={() => setEntry('auth')} />;
  if (entry === 'auth') return <Auth onBack={() => setEntry('welcome')} onContinue={() => setEntry('app')} />;
  return <AppShell />;
}
