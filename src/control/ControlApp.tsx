import { useMemo, useState, type ReactNode } from 'react';
import { BrandMark } from '../components/Brand';

type ViewId = 'overview' | 'support' | 'problems' | 'processes' | 'events' | 'settings';
type ProcessState = 'preview' | 'offline' | 'planned';

type ProcessItem = {
  name: string;
  description: string;
  state: ProcessState;
  label: string;
};

const navigation: Array<{ id: ViewId; label: string; shortLabel: string }> = [
  { id: 'overview', label: 'Обзор', shortLabel: 'Обзор' },
  { id: 'support', label: 'Поддержка', shortLabel: 'Поддержка' },
  { id: 'problems', label: 'Проблемы', shortLabel: 'Проблемы' },
  { id: 'processes', label: 'Процессы', shortLabel: 'Процессы' },
  { id: 'events', label: 'События', shortLabel: 'События' },
  { id: 'settings', label: 'Настройки', shortLabel: 'Настройки' },
];

const processItems: ProcessItem[] = [
  {
    name: 'Пользовательский интерфейс',
    description: 'React/Vite frontend preview ARVELIS AI.',
    state: 'preview',
    label: 'FRONTEND PREVIEW',
  },
  {
    name: 'Авторизация',
    description: 'Production account/session backend ещё не подключён.',
    state: 'planned',
    label: 'НЕ ПОДКЛЮЧЕНО',
  },
  {
    name: 'AI Gateway',
    description: 'Провайдеры и реальные AI-вызовы ещё не подключены.',
    state: 'planned',
    label: 'НЕ ПОДКЛЮЧЕНО',
  },
  {
    name: 'Серверное хранение',
    description: 'Production database/storage отсутствует; preview использует локальные данные.',
    state: 'planned',
    label: 'НЕ ПОДКЛЮЧЕНО',
  },
  {
    name: 'Поддержка',
    description: 'Email/helpdesk provider и inbound ticket pipeline пока не выбраны.',
    state: 'planned',
    label: 'НЕ ПОДКЛЮЧЕНО',
  },
  {
    name: 'CONTROL audit',
    description: 'Серверный журнал административных действий должен появиться до production.',
    state: 'planned',
    label: 'НЕ ПОДКЛЮЧЕНО',
  },
];

function ShieldIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5.2c0 4.7-2.7 7.8-7 9.8-4.3-2-7-5.1-7-9.8V6Z" /><path d="m9.2 12 1.8 1.8 3.9-4" /></svg>;
}

function InboxIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4Z" /><path d="m4 8 8 6 8-6" /></svg>;
}

function AlertIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 21 20H3Z" /><path d="M12 9v5M12 17h.01" /></svg>;
}

function PulseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2.2-5.2 4.1 10.4 2.3-5.2H21" /></svg>;
}

function EventIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5Z" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" /></svg>;
}

const icons: Record<ViewId, ReactNode> = {
  overview: <ShieldIcon />,
  support: <InboxIcon />,
  problems: <AlertIcon />,
  processes: <PulseIcon />,
  events: <EventIcon />,
  settings: <SettingsIcon />,
};

function StatusBadge({ state, children }: { state: ProcessState; children: ReactNode }) {
  return <span className={`control-status control-status--${state}`}>{children}</span>;
}

function PageHeader({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return (
    <header className="control-page-header">
      <div>
        <p className="control-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <span className="control-preview-chip">INTERNAL PREVIEW</span>
    </header>
  );
}

function EmptyOperationalState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="control-empty-state">
      <span className="control-empty-state__icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </section>
  );
}

function Overview() {
  return (
    <div className="control-view">
      <PageHeader
        kicker="ARVELIS CONTROL"
        title="Центр управления"
        description="Единая operational-панель владельца ARVELIS AI. Сейчас здесь отображается только фактическое состояние frontend foundation — без выдуманных production-метрик."
      />

      <section className="control-summary-grid" aria-label="Статус продукта">
        <article>
          <span>ПРОДУКТ</span>
          <strong>Frontend preview</strong>
          <p>Пользовательский интерфейс развивается в GitHub/Replit.</p>
        </article>
        <article>
          <span>АВТОРИЗАЦИЯ</span>
          <strong>Не подключена</strong>
          <p>Защищённых user/admin sessions пока нет.</p>
        </article>
        <article>
          <span>AI</span>
          <strong>Не подключён</strong>
          <p>Реальные AI-провайдеры и Gateway ещё не активированы.</p>
        </article>
        <article>
          <span>BACKEND</span>
          <strong>Не подключён</strong>
          <p>Production API, DB, audit и support pipeline отсутствуют.</p>
        </article>
      </section>

      <section className="control-section">
        <div className="control-section-heading">
          <div><p className="control-kicker">ОПЕРАЦИОННЫЙ КОНТУР</p><h2>Что будет контролироваться здесь</h2></div>
        </div>
        <div className="control-operations-grid">
          <article>
            <span className="control-operation-icon"><InboxIcon /></span>
            <div><strong>Поддержка</strong><p>Обращения пользователей и коммуникация с поддержкой из единого inbox.</p></div>
            <StatusBadge state="planned">НЕ ПОДКЛЮЧЕНО</StatusBadge>
          </article>
          <article>
            <span className="control-operation-icon"><AlertIcon /></span>
            <div><strong>Проблемы</strong><p>Инциденты, ошибки и operational work queue без смешивания с пользовательским UI.</p></div>
            <StatusBadge state="planned">НЕ ПОДКЛЮЧЕНО</StatusBadge>
          </article>
          <article>
            <span className="control-operation-icon"><PulseIcon /></span>
            <div><strong>Процессы</strong><p>Состояние ключевых модулей продукта и интеграций.</p></div>
            <StatusBadge state="preview">FOUNDATION</StatusBadge>
          </article>
          <article>
            <span className="control-operation-icon"><EventIcon /></span>
            <div><strong>Audit и события</strong><p>Административные действия и критические системные события после backend.</p></div>
            <StatusBadge state="planned">НЕ ПОДКЛЮЧЕНО</StatusBadge>
          </article>
        </div>
      </section>

      <section className="control-security-boundary">
        <span className="control-security-boundary__icon"><ShieldIcon /></span>
        <div>
          <p className="control-kicker">SECURITY BOUNDARY</p>
          <h2>CONTROL не доверяет frontend-правам.</h2>
          <p>До подключения реальных данных каждый административный доступ и действие должны проверяться сервером. API-ключи, session secrets и прямые database credentials в этот интерфейс не попадут.</p>
        </div>
      </section>
    </div>
  );
}

function Support() {
  return (
    <div className="control-view">
      <PageHeader kicker="ПОДДЕРЖКА" title="Входящие обращения" description="Будущий единый inbox для писем и запросов технической поддержки." />
      <div className="control-toolbar">
        <div className="control-toolbar__field" aria-disabled="true">Поиск по обращениям</div>
        <StatusBadge state="planned">КАНАЛ НЕ ПОДКЛЮЧЕН</StatusBadge>
      </div>
      <EmptyOperationalState icon={<InboxIcon />} title="Обращений из production пока нет">
        Email/helpdesk provider ещё не выбран и inbound pipeline не подключён. После интеграции новые обращения будут поступать сюда с серверной идентификацией, статусами и audit trail.
      </EmptyOperationalState>
      <section className="control-note-grid">
        <article><span>01</span><strong>Источник</strong><p>Email, форма поддержки или другой helpdesk-канал — OPEN.</p></article>
        <article><span>02</span><strong>Доступ</strong><p>Support data будет доступна только разрешённым owner/admin ролям.</p></article>
        <article><span>03</span><strong>История</strong><p>Ответы и изменения статусов должны попадать в серверный audit.</p></article>
      </section>
    </div>
  );
}

function Problems() {
  return (
    <div className="control-view">
      <PageHeader kicker="ПРОБЛЕМЫ" title="Инциденты и задачи" description="Operational work queue для ошибок и проблем продукта. Live-monitoring пока отсутствует." />
      <EmptyOperationalState icon={<AlertIcon />} title="Production incident feed не подключён">
        CONTROL не создаёт фальшивые инциденты. После появления backend/observability сюда можно направлять реальные ошибки, деградации и задачи с приоритетом, ответственным и историей решений.
      </EmptyOperationalState>
    </div>
  );
}

function Processes() {
  return (
    <div className="control-view">
      <PageHeader kicker="ПРОЦЕССЫ" title="Состояние модулей" description="Фактическая карта текущих компонентов ARVELIS AI. Статусы отражают только реально существующую архитектуру." />
      <section className="control-process-list" aria-label="Модули ARVELIS AI">
        {processItems.map((item) => (
          <article key={item.name}>
            <div className="control-process-list__copy"><strong>{item.name}</strong><p>{item.description}</p></div>
            <StatusBadge state={item.state}>{item.label}</StatusBadge>
          </article>
        ))}
      </section>
    </div>
  );
}

function Events() {
  return (
    <div className="control-view">
      <PageHeader kicker="СОБЫТИЯ" title="Audit и активность" description="Здесь будет отображаться серверная история административных действий и критических событий." />
      <EmptyOperationalState icon={<EventIcon />} title="Серверный audit log ещё не создан">
        Локальные UI-события не выдаются за audit. До production нужен отдельный backend-журнал с actor, action, target, timestamp, result и защищённой политикой хранения.
      </EmptyOperationalState>
    </div>
  );
}

function Settings() {
  return (
    <div className="control-view">
      <PageHeader kicker="НАСТРОЙКИ" title="Контур CONTROL" description="Архитектурные решения и границы административного интерфейса." />
      <section className="control-settings-list">
        <article><div><strong>Отдельный entry-point</strong><p>CONTROL не является экраном пользовательского ARVELIS AI.</p></div><StatusBadge state="preview">ВКЛЮЧЕНО</StatusBadge></article>
        <article><div><strong>Owner/admin авторизация</strong><p>Метод входа и роли будут утверждены перед подключением реальных данных.</p></div><StatusBadge state="planned">OPEN</StatusBadge></article>
        <article><div><strong>Production domain</strong><p>Отдельный origin обязателен; конкретный домен пока не выбран.</p></div><StatusBadge state="planned">OPEN</StatusBadge></article>
        <article><div><strong>Secrets</strong><p>Production secrets не должны вводиться, храниться или отображаться в CONTROL frontend.</p></div><StatusBadge state="preview">ПРАВИЛО</StatusBadge></article>
      </section>
    </div>
  );
}

function ControlContent({ view }: { view: ViewId }) {
  switch (view) {
    case 'support': return <Support />;
    case 'problems': return <Problems />;
    case 'processes': return <Processes />;
    case 'events': return <Events />;
    case 'settings': return <Settings />;
    case 'overview':
    default: return <Overview />;
  }
}

function ControlPreviewGate({ onOpen }: { onOpen: () => void }) {
  return (
    <main className="control-gate">
      <section className="control-gate__panel">
        <div className="control-gate__brand">
          <BrandMark size="default" />
          <div><span>ARVELIS</span><strong>CONTROL</strong></div>
        </div>
        <p className="control-kicker">INTERNAL FRONTEND PREVIEW</p>
        <h1>Центр управления ARVELIS AI</h1>
        <p className="control-gate__lead">Отдельный owner/admin интерфейс для процессов, проблем и технической поддержки.</p>
        <div className="control-gate__notice">
          <ShieldIcon />
          <div><strong>Это ещё не защищённый административный вход.</strong><p>В preview нет реальных пользователей, писем, секретов или production-данных. Перед подключением данных CONTROL получит отдельную server-side авторизацию и audit.</p></div>
        </div>
        <button type="button" className="control-primary-button" onClick={onOpen}>Открыть локальный прототип</button>
      </section>
    </main>
  );
}

export function ControlApp() {
  const [previewOpened, setPreviewOpened] = useState(false);
  const [view, setView] = useState<ViewId>('overview');
  const activeNavigation = useMemo(() => navigation.find((item) => item.id === view) ?? navigation[0]!, [view]);

  if (!previewOpened) {
    return <ControlPreviewGate onOpen={() => setPreviewOpened(true)} />;
  }

  return (
    <div className="control-shell">
      <aside className="control-sidebar">
        <header className="control-sidebar__brand">
          <BrandMark size="compact" />
          <div><span>ARVELIS</span><strong>CONTROL</strong></div>
        </header>
        <div className="control-sidebar__mode"><span />INTERNAL PREVIEW</div>
        <nav className="control-sidebar__nav" aria-label="ARVELIS CONTROL">
          {navigation.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === view ? 'control-nav-item control-nav-item--active' : 'control-nav-item'}
              aria-current={item.id === view ? 'page' : undefined}
              onClick={() => setView(item.id)}
            >
              <span className="control-nav-item__icon">{icons[item.id]}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <footer className="control-sidebar__footer">
          <span>CONTROL v0.1</span>
          <p>Без production-данных</p>
        </footer>
      </aside>

      <div className="control-main">
        <div className="control-mobile-topbar">
          <div className="control-mobile-topbar__brand"><BrandMark size="compact" /><div><span>ARVELIS</span><strong>CONTROL</strong></div></div>
          <span>{activeNavigation.shortLabel}</span>
        </div>
        <ControlContent view={view} />
      </div>

      <nav className="control-mobile-nav" aria-label="Мобильная навигация ARVELIS CONTROL">
        {navigation.map((item) => (
          <button
            type="button"
            key={item.id}
            className={item.id === view ? 'control-mobile-nav__item control-mobile-nav__item--active' : 'control-mobile-nav__item'}
            aria-label={item.label}
            aria-current={item.id === view ? 'page' : undefined}
            onClick={() => setView(item.id)}
          >
            {icons[item.id]}
          </button>
        ))}
      </nav>
    </div>
  );
}
