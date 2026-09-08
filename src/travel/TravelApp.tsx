import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { BrandLockup } from '../components/Brand';
import {
  calculateBudget,
  createTripDraft,
  TRAVEL_CAPABILITY_STATE,
  validateCreateTripInput,
  type CreateTripInput,
  type Trip,
  type TripStatus,
  type TripValidationError,
} from './domain';
import { canUseTravelStorage, createBrowserTripRepository } from './storage';

type TravelScreen = 'home' | 'trips' | 'create' | 'trip' | 'profile' | 'states';
type WorkspaceTab = 'overview' | 'itinerary' | 'map' | 'budget' | 'documents' | 'legal' | 'tripBook';

const STATUS_LABELS: Record<TripStatus, string> = {
  draft: 'Черновик',
  planning: 'Планирование',
  ready: 'Готово',
  active: 'В поездке',
  completed: 'Завершено',
  archived: 'Архив',
};

const VACATION_TYPES = ['Море', 'Город', 'Природа', 'Культура', 'Активный отдых', 'Спокойный отдых'];
const INTERESTS = ['Еда', 'История', 'Архитектура', 'Пляжи', 'Музеи', 'Прогулки', 'Природа'];
const TRANSPORT = ['Самолёт', 'Поезд', 'Автобус', 'Автомобиль', 'Минимум пересадок'];

const EMPTY_FORM: CreateTripInput = {
  origin: '',
  destination: '',
  destinationUnknown: false,
  startDate: '',
  endDate: '',
  flexibleDates: false,
  durationDays: 7,
  travelerCount: 2,
  budgetLimitRub: 120000,
  vacationTypes: [],
  interests: [],
  transportPreferences: [],
  additionalNotes: '',
};

function formatDate(value?: string): string {
  if (!value) return 'Гибкие даты';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatUpdated(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

function ToggleGroup({ values, selected, onChange }: { values: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="travel-toggle-grid">
      {values.map((value) => {
        const active = selected.includes(value);
        return (
          <button
            type="button"
            key={value}
            className={active ? 'travel-toggle is-active' : 'travel-toggle'}
            aria-pressed={active}
            onClick={() => onChange(active ? selected.filter((item) => item !== value) : [...selected, value])}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <section className="travel-empty" role="status">
      <div className="travel-empty__mark" aria-hidden="true">A</div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </section>
  );
}

export function TravelApp({
  ownerScopeId,
  profileName,
  online,
  dataRevision,
  renderProfile,
  renderStates,
}: {
  ownerScopeId: string;
  profileName: string;
  online: boolean;
  dataRevision: number;
  renderProfile: (openStates: () => void) => ReactNode;
  renderStates: () => ReactNode;
}) {
  const repository = useMemo(() => createBrowserTripRepository(ownerScopeId), [ownerScopeId]);
  const [screen, setScreen] = useState<TravelScreen>('home');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('overview');
  const [form, setForm] = useState<CreateTripInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<TripValidationError[]>([]);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    setStorageAvailable(canUseTravelStorage());
    setTrips(repository.list());
  }, [repository, dataRevision]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [screen, workspaceTab]);

  const selectedTrip = selectedTripId ? trips.find((trip) => trip.id === selectedTripId) ?? repository.get(selectedTripId) : null;

  const openTrip = (tripId: string) => {
    setSelectedTripId(tripId);
    setWorkspaceTab('overview');
    setScreen('trip');
  };

  const createTrip = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateCreateTripInput(form);
    setErrors(nextErrors);
    if (nextErrors.length > 0) return;

    const trip = createTripDraft(form, ownerScopeId);
    try {
      repository.save(trip);
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
      return;
    }
    setTrips(repository.list());
    setSelectedTripId(trip.id);
    setWorkspaceTab('overview');
    setForm(EMPTY_FORM);
    setScreen('trip');
  };

  const fieldError = (field: TripValidationError['field']) => errors.find((error) => error.field === field)?.message;

  const header = (
    <header className="travel-header">
      <button type="button" className="travel-brand-button" onClick={() => setScreen('home')} aria-label="ARVELIS AI — на главную">
        <BrandLockup compact />
      </button>
      <div className="travel-header__status" aria-label={online ? 'Онлайн' : 'Офлайн'}>
        <span className={online ? 'travel-online-dot is-online' : 'travel-online-dot'} />
        {online ? 'Онлайн' : 'Офлайн'}
      </div>
    </header>
  );

  const bottomNav = screen === 'states' ? null : (
    <nav className="travel-bottom-nav" aria-label="Основная навигация">
      <button className={screen === 'home' ? 'is-active' : ''} type="button" onClick={() => setScreen('home')}><span>Главная</span></button>
      <button className={screen === 'trips' || screen === 'trip' ? 'is-active' : ''} type="button" onClick={() => setScreen('trips')}><span>Поездки</span></button>
      <button className={screen === 'create' ? 'is-active travel-bottom-nav__create' : 'travel-bottom-nav__create'} type="button" onClick={() => setScreen('create')}><span>Создать</span></button>
      <button className={screen === 'profile' ? 'is-active' : ''} type="button" onClick={() => setScreen('profile')}><span>Профиль</span></button>
    </nav>
  );

  const home = (
    <main className="travel-page travel-home">
      <section className="travel-hero">
        <p className="travel-kicker">AI TRAVEL ASSISTANT</p>
        <h1>Путешествие начинается с точного плана.</h1>
        <p>ARVELIS объединяет бюджет, транспорт, время, комфорт, legal-проверки, маршрут, карту и Trip Book в одном рабочем пространстве.</p>
        <button className="travel-primary" type="button" onClick={() => setScreen('create')}>Создать поездку</button>
        <div className="travel-truth-note">Реальный AI и внешние travel-провайдеры пока не подключены. Созданные вами поездки сохраняются как локальные черновики.</div>
      </section>

      <section className="travel-section">
        <div className="travel-section__heading">
          <div><p className="travel-kicker">ВАШИ ДАННЫЕ</p><h2>Последние поездки</h2></div>
          <button className="travel-link" type="button" onClick={() => setScreen('trips')}>Мои поездки</button>
        </div>
        {trips.length === 0 ? (
          <EmptyState title="У вас пока нет поездок" text="Создайте первый черновик — ARVELIS сохранит только введённые вами параметры, без выдуманных рейсов, цен и рекомендаций." action={<button className="travel-secondary" type="button" onClick={() => setScreen('create')}>Создать поездку</button>} />
        ) : (
          <div className="travel-card-grid">
            {trips.slice(0, 3).map((trip) => <TripCard key={trip.id} trip={trip} onOpen={() => openTrip(trip.id)} />)}
          </div>
        )}
      </section>
    </main>
  );

  const tripsScreen = (
    <main className="travel-page">
      <div className="travel-title-row"><div><p className="travel-kicker">TRIPS</p><h1>Мои поездки</h1><p>Реальные черновики, созданные в этом аккаунте или локальном профиле.</p></div><button className="travel-primary travel-primary--compact" type="button" onClick={() => setScreen('create')}>Создать поездку</button></div>
      {trips.length === 0 ? <EmptyState title="У вас пока нет поездок" text="Начните с основных параметров: откуда, даты, длительность, состав и бюджет." action={<button className="travel-secondary" type="button" onClick={() => setScreen('create')}>Создать поездку</button>} /> : <div className="travel-card-grid">{trips.map((trip) => <TripCard key={trip.id} trip={trip} onOpen={() => openTrip(trip.id)} />)}</div>}
    </main>
  );

  const createScreen = (
    <main className="travel-page travel-create">
      <div className="travel-title-row"><div><p className="travel-kicker">NEW TRIP</p><h1>Создать поездку</h1><p>Сейчас создаётся только ваш локальный черновик. Поиск билетов, отелей и AI-планирование не запускаются.</p></div></div>
      {!storageAvailable ? <div className="travel-alert" role="alert">Локальное хранилище недоступно. Черновик нельзя надёжно сохранить на этом устройстве.</div> : null}
      <form className="travel-form" onSubmit={createTrip} noValidate>
        <section className="travel-form-section"><h2>Основа поездки</h2><div className="travel-form-grid">
          <label><span>Откуда</span><input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Например, Казань" autoComplete="address-level2" aria-invalid={Boolean(fieldError('origin'))} />{fieldError('origin') ? <small className="travel-field-error">{fieldError('origin')}</small> : null}</label>
          <label><span>Куда</span><input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} disabled={form.destinationUnknown} placeholder="Страна или город" aria-invalid={Boolean(fieldError('destination'))} />{fieldError('destination') ? <small className="travel-field-error">{fieldError('destination')}</small> : null}</label>
        </div><label className="travel-check"><input type="checkbox" checked={form.destinationUnknown} onChange={(e) => setForm({ ...form, destinationUnknown: e.target.checked, destination: e.target.checked ? '' : form.destination })} /><span>Не знаю куда — направление будет подбираться на следующем real-data этапе</span></label></section>

        <section className="travel-form-section"><h2>Даты и состав</h2><label className="travel-check"><input type="checkbox" checked={form.flexibleDates} onChange={(e) => setForm({ ...form, flexibleDates: e.target.checked })} /><span>Гибкие даты</span></label><div className="travel-form-grid travel-form-grid--three">
          <label><span>Начало</span><input type="date" value={form.startDate} disabled={form.flexibleDates} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          <label><span>Окончание</span><input type="date" value={form.endDate} disabled={form.flexibleDates} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          <label><span>Количество дней</span><input type="number" min="1" max="90" inputMode="numeric" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })} aria-invalid={Boolean(fieldError('durationDays'))} /></label>
          <label><span>Путешественников</span><input type="number" min="1" max="20" inputMode="numeric" value={form.travelerCount} onChange={(e) => setForm({ ...form, travelerCount: Number(e.target.value) })} aria-invalid={Boolean(fieldError('travelerCount'))} /></label>
          <label><span>Бюджет, ₽</span><input type="number" min="1" step="1000" inputMode="numeric" value={form.budgetLimitRub} onChange={(e) => setForm({ ...form, budgetLimitRub: Number(e.target.value) })} aria-invalid={Boolean(fieldError('budgetLimitRub'))} /></label>
        </div>{fieldError('dates') ? <p className="travel-field-error">{fieldError('dates')}</p> : null}</section>

        <section className="travel-form-section"><h2>Предпочтения</h2><div className="travel-field-block"><span>Тип отдыха</span><ToggleGroup values={VACATION_TYPES} selected={form.vacationTypes} onChange={(vacationTypes) => setForm({ ...form, vacationTypes })} /></div><div className="travel-field-block"><span>Интересы</span><ToggleGroup values={INTERESTS} selected={form.interests} onChange={(interests) => setForm({ ...form, interests })} /></div><div className="travel-field-block"><span>Транспортные предпочтения</span><ToggleGroup values={TRANSPORT} selected={form.transportPreferences} onChange={(transportPreferences) => setForm({ ...form, transportPreferences })} /></div><label><span>Дополнительные пожелания</span><textarea rows={4} value={form.additionalNotes} onChange={(e) => setForm({ ...form, additionalNotes: e.target.value })} placeholder="Например: не хотим сложных пересадок" /></label></section>

        <div className="travel-form-actions"><button className="travel-secondary" type="button" onClick={() => setScreen('home')}>Отмена</button><button className="travel-primary" type="submit" disabled={!storageAvailable}>Сохранить черновик</button></div>
      </form>
    </main>
  );

  const tripScreen = selectedTrip ? <TripWorkspace trip={selectedTrip} tab={workspaceTab} onTab={setWorkspaceTab} onBack={() => setScreen('trips')} /> : <main className="travel-page"><EmptyState title="Поездка не найдена" text="Черновик отсутствует в текущем пользовательском контуре." action={<button className="travel-secondary" type="button" onClick={() => setScreen('trips')}>К поездкам</button>} /></main>;

  return (
    <div className="travel-app">
      {screen !== 'states' ? header : null}
      <div className="travel-shell" data-storage={storageAvailable ? 'ready' : 'unavailable'}>
        {screen === 'home' ? home : null}
        {screen === 'trips' ? tripsScreen : null}
        {screen === 'create' ? createScreen : null}
        {screen === 'trip' ? tripScreen : null}
        {screen === 'profile' ? <main className="travel-page travel-legacy-slot">{renderProfile(() => setScreen('states'))}</main> : null}
        {screen === 'states' ? <div className="travel-states-wrap"><button type="button" className="travel-back" onClick={() => setScreen('profile')}>← Профиль</button>{renderStates()}</div> : null}
      </div>
      {bottomNav}
      <span className="travel-sr-only" aria-live="polite">Профиль: {profileName}. AI: {TRAVEL_CAPABILITY_STATE.aiProvider}.</span>
    </div>
  );
}

function TripCard({ trip, onOpen }: { trip: Trip; onOpen: () => void }) {
  return (
    <button className="travel-trip-card" type="button" onClick={onOpen}>
      <div className="travel-trip-card__top"><span className="travel-status">{STATUS_LABELS[trip.status]}</span><span>{formatUpdated(trip.updatedAt)}</span></div>
      <h3>{trip.title}</h3>
      <p>{trip.destination ?? 'Направление ещё не выбрано'}</p>
      <div className="travel-trip-card__meta"><span>{trip.startDate ? `${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}` : 'Гибкие даты'}</span><span>{trip.durationDays} дн.</span><span>{trip.travelers.length} чел.</span></div>
      <div className="travel-trip-card__budget"><span>Лимит бюджета</span><strong>{formatMoney(trip.budget.limitRub)} ₽</strong></div>
    </button>
  );
}

function TripWorkspace({ trip, tab, onTab, onBack }: { trip: Trip; tab: WorkspaceTab; onTab: (tab: WorkspaceTab) => void; onBack: () => void }) {
  const budget = calculateBudget(trip.budget);
  const tabs: Array<[WorkspaceTab, string]> = [['overview','Обзор'],['itinerary','Маршрут'],['map','Карта'],['budget','Бюджет'],['documents','Документы'],['legal','Legal'],['tripBook','Trip Book']];
  return (
    <main className="travel-page travel-workspace">
      <button className="travel-back" type="button" onClick={onBack}>← Мои поездки</button>
      <section className="travel-workspace__hero"><div><p className="travel-kicker">TRIP WORKSPACE</p><h1>{trip.title}</h1><p>{trip.origin} · {trip.destination ?? 'Направление подбирается'} · {trip.durationDays} дней</p></div><span className="travel-status travel-status--large">{STATUS_LABELS[trip.status]}</span></section>
      <div className="travel-tabs" role="tablist" aria-label="Разделы поездки">{tabs.map(([value,label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : ''} onClick={() => onTab(value)}>{label}</button>)}</div>
      {tab === 'overview' ? <section className="travel-workspace-grid"><article className="travel-panel"><p className="travel-kicker">ПАРАМЕТРЫ</p><h2>Поездка</h2><dl><div><dt>Даты</dt><dd>{trip.startDate ? `${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}` : 'Гибкие'}</dd></div><div><dt>Путешественники</dt><dd>{trip.travelers.length}</dd></div><div><dt>Бюджет</dt><dd>{formatMoney(trip.budget.limitRub)} ₽</dd></div><div><dt>Статус</dt><dd>{STATUS_LABELS[trip.status]}</dd></div></dl></article><article className="travel-panel"><p className="travel-kicker">ПЛАН</p><h2>AI-план ещё не создан</h2><p>Реальный AI provider в этом Foundation slice не подключён. Здесь появится план только после отдельной интеграции и явного запуска пользователем.</p></article><article className="travel-panel travel-panel--wide"><p className="travel-kicker">ПОЖЕЛАНИЯ</p><h2>Параметры</h2><p>{trip.preferences.additionalNotes || 'Дополнительные пожелания не указаны.'}</p><div className="travel-chip-row">{[...trip.preferences.vacationTypes, ...trip.preferences.interests, ...trip.preferences.transportPreferences].map((item) => <span key={item}>{item}</span>)}</div></article></section> : null}
      {tab === 'itinerary' ? <EmptyState title="Маршрут по дням пока пуст" text="ARVELIS не создаёт демонстрационный маршрут и не выдаёт sample-точки за реальные. Здесь появятся пользовательские или подтверждённые provider-данные." /> : null}
      {tab === 'map' ? <EmptyState title="Карта ещё не подключена" text="MapProvider заложен архитектурно, но реальный картографический сервис в этом проходе не подключался. Фиктивная карта не отображается." /> : null}
      {tab === 'budget' ? <section className="travel-budget"><div className="travel-budget__metric"><span>Лимит</span><strong>{formatMoney(budget.limitRub)} ₽</strong></div><div className="travel-budget__metric"><span>Рассчитанные расходы</span><strong>{formatMoney(budget.spentRub)} ₽</strong></div><div className="travel-budget__metric"><span>Резерв</span><strong>{formatMoney(budget.reserveRub)} ₽</strong></div><div className="travel-budget__metric"><span>Остаток</span><strong>{formatMoney(budget.remainingRub)} ₽</strong></div><p className="travel-truth-note">Автоматические цены отсутствуют. Сейчас расходы равны только фактически добавленным BudgetItem; новых элементов система не выдумывает.</p></section> : null}
      {tab === 'documents' ? <EmptyState title="Документы не добавлены" text="Документный контур предусмотрен в Trip Book, но загрузка и обработка travel-документов вынесены в отдельный безопасный slice." /> : null}
      {tab === 'legal' ? <section className="travel-panel"><p className="travel-kicker">LEGAL</p><h2>Юридическая проверка не запускалась</h2><p>Правила въезда и визовые требования не генерируются автоматически. Будущие результаты должны содержать источник, URL, дату проверки, период действия и статус уверенности.</p><div className="travel-alert travel-alert--neutral">Правила путешествий меняются. До подключения проверенного LegalSourceProvider ориентируйтесь только на официальные источники.</div></section> : null}
      {tab === 'tripBook' ? <section className="travel-panel"><p className="travel-kicker">TRIP BOOK</p><h2>Структура книги поездки</h2><div className="travel-tripbook-grid">{trip.tripBook.sections.map((section) => <div key={section.key}><span>{section.key}</span><strong>{section.status === 'empty' ? 'Не заполнено' : section.status}</strong></div>)}</div><p>PDF-генерация не включена в этот slice.</p></section> : null}
    </main>
  );
}
