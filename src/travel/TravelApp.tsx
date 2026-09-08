import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLockup } from '../components/Brand';
import { createTripDraft, TRAVEL_CAPABILITY_STATE, validateCreateTripInput, type CreateTripInput, type Trip, type TripValidationError } from './domain';
import { createGeneralAssistantContext, createTripAssistantContext, type TravelAssistantContext, type TravelAssistantUiStatus } from './assistantContext';
import { canUseTravelStorage, createBrowserTripRepository } from './storage';
import { AssistantScreen } from './AssistantScreen';
import { CreateTripScreen } from './CreateTripScreen';
import { HomeScreen, TripsScreen } from './HomeTripsScreens';
import { HelpScreen, ServiceFoundation, SettingsScreen } from './ServiceScreens';
import { TripWorkspace, type WorkspaceTab } from './TripWorkspace';
import { EMPTY_FORM, EmptyState } from './ui';

type TravelScreen = 'home' | 'assistant' | 'trips' | 'create' | 'trip' | 'documents' | 'routes' | 'budgetService' | 'legalService' | 'mapService' | 'profile' | 'settings' | 'help' | 'states';
type NavItem = { screen: TravelScreen; label: string };

const PRIMARY_NAV: NavItem[] = [
  { screen: 'home', label: 'Главная' },
  { screen: 'assistant', label: 'ARVELIS AI' },
  { screen: 'trips', label: 'Мои поездки' },
  { screen: 'create', label: 'Создать поездку' },
  { screen: 'documents', label: 'Документы' },
];
const SERVICE_NAV: NavItem[] = [
  { screen: 'routes', label: 'Маршруты' },
  { screen: 'budgetService', label: 'Бюджет' },
  { screen: 'legalService', label: 'Travel Legal' },
  { screen: 'mapService', label: 'Карта' },
];
const ACCOUNT_NAV: NavItem[] = [
  { screen: 'profile', label: 'Профиль' },
  { screen: 'settings', label: 'Настройки' },
  { screen: 'help', label: 'Помощь' },
];

function MenuIcon() {
  return <span className="travel-menu-icon" aria-hidden="true"><i /><i /><i /></span>;
}

function NavIcon({ screen }: { screen: TravelScreen }) {
  const pathByScreen: Partial<Record<TravelScreen, string[]>> = {
    home: ['M3 10.5 10 4l7 6.5', 'M5.5 9.5V17h9V9.5'],
    assistant: ['M4 5.5h12v9H9l-4 3v-3H4z', 'M7 9h6', 'M7 12h4'],
    trips: ['M4 7h12v9H4z', 'M7 7V5.5h6V7'],
    create: ['M10 4v12', 'M4 10h12'],
    documents: ['M6 3.5h6l3 3V17H6z', 'M12 3.5V7h3', 'M8 10h5', 'M8 13h5'],
    routes: ['M4 15.5c2.2-5 4-1 6-6s4-1 6-5', 'M4 15.5h3', 'M4 15.5V13'],
    budgetService: ['M4 6h12v9H4z', 'M12.5 10.5h3', 'M6.5 8.5h3'],
    legalService: ['M10 3.5 15 5v4.5c0 3.2-2 5.8-5 7-3-1.2-5-3.8-5-7V5z', 'm7.5 10 1.5 1.5 3.5-3.5'],
    mapService: ['M6 4 3.5 5.5v11L6 15l4 1.5 4-1.5 2.5 1.5v-11L14 4l-4 1.5z', 'M6 4v11', 'M10 5.5v11', 'M14 4v11'],
    profile: ['M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M4.5 17c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5'],
    settings: ['M10 7.2A2.8 2.8 0 1 0 10 12.8 2.8 2.8 0 0 0 10 7.2', 'M10 3.5v2', 'M10 14.5v2', 'M3.5 10h2', 'M14.5 10h2', 'm5.4 5.4 1.4 1.4', 'm13.2 13.2 1.4 1.4', 'm14.6 5.4-1.4 1.4', 'm6.8 13.2-1.4 1.4'],
    help: ['M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14', 'M8.2 8a1.9 1.9 0 1 1 2.5 1.8c-.9.4-1.3 1-1.3 1.8', 'M10 14h.01'],
  };
  return <svg className="travel-drawer__icon" viewBox="0 0 20 20" aria-hidden="true">{(pathByScreen[screen] ?? []).map((path) => <path key={path} d={path} />)}</svg>;
}

export function TravelApp({ ownerScopeId, profileName, online, dataRevision, renderProfile, renderStates }: {
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [homePrompt, setHomePrompt] = useState('');
  const [assistantMessage, setAssistantMessage] = useState('');
  const [assistantContext, setAssistantContext] = useState<TravelAssistantContext>(() => createGeneralAssistantContext('assistant'));
  const [assistantStatus, setAssistantStatus] = useState<TravelAssistantUiStatus>('empty');
  const drawerRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setStorageAvailable(canUseTravelStorage());
    setTrips(repository.list());
  }, [repository, dataRevision]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [screen, workspaceTab]);

  useEffect(() => {
    if (!menuOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () => [...drawer.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  const selectedTrip = selectedTripId ? trips.find((trip) => trip.id === selectedTripId) ?? repository.get(selectedTripId) : null;

  const navigate = (nextScreen: TravelScreen) => {
    setScreen(nextScreen);
    setMenuOpen(false);
    if (nextScreen !== 'trip') setWorkspaceTab('overview');
    if (nextScreen === 'assistant') {
      setAssistantContext(createGeneralAssistantContext('assistant'));
      setAssistantMessage('');
      setAssistantStatus(online ? 'empty' : 'offline');
    }
  };

  const openTrip = (tripId: string) => {
    setSelectedTripId(tripId);
    setWorkspaceTab('overview');
    setScreen('trip');
  };

  const openGeneralAssistant = (message = '', source: 'home' | 'assistant' | 'service' = 'assistant') => {
    setAssistantContext(createGeneralAssistantContext(source));
    setAssistantMessage(message.trim());
    setAssistantStatus(!online ? 'offline' : message.trim() ? 'not_connected' : 'empty');
    setScreen('assistant');
  };

  const openTripAssistant = (trip: Trip) => {
    setAssistantContext(createTripAssistantContext(trip));
    setAssistantMessage('');
    setAssistantStatus(online ? 'not_connected' : 'offline');
    setScreen('assistant');
  };

  const submitHomePrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!homePrompt.trim()) return;
    openGeneralAssistant(homePrompt, 'home');
  };

  const submitAssistantPrompt = (event: FormEvent<HTMLFormElement>, value: string) => {
    event.preventDefault();
    const message = value.trim();
    if (!message) return;
    setAssistantMessage(message);
    setAssistantStatus(online ? 'not_connected' : 'offline');
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
    setErrors([]);
    setScreen('trip');
  };

  const isNavSelected = (item: NavItem) => item.screen === 'trips' && screen === 'trip' ? true : screen === item.screen;
  const renderNavItems = (items: NavItem[]) => items.map((item) => <button key={item.screen} type="button" className={isNavSelected(item) ? 'travel-drawer__item is-active' : 'travel-drawer__item'} aria-current={isNavSelected(item) ? 'page' : undefined} onClick={() => navigate(item.screen)}><NavIcon screen={item.screen} /><span>{item.label}</span></button>);

  const header = screen === 'states' ? null : <header className="travel-header">
    <button ref={menuButtonRef} type="button" className="travel-menu-button" aria-label="Открыть меню" aria-expanded={menuOpen} aria-controls="travel-navigation-drawer" onClick={() => setMenuOpen(true)}><MenuIcon /></button>
    <button type="button" className="travel-brand-button" onClick={() => navigate('home')} aria-label="ARVELIS AI — на главную"><BrandLockup compact variant="travel" /></button>
  </header>;

  const drawer = menuOpen ? <div className="travel-drawer-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
    <aside id="travel-navigation-drawer" ref={drawerRef} className="travel-drawer is-open" role="dialog" aria-modal="true" aria-label="Навигация ARVELIS AI">
      <div className="travel-drawer__top"><div className="travel-drawer__brand"><BrandLockup compact variant="travel" /></div><button type="button" className="travel-drawer__close" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню">×</button></div>
      <nav className="travel-drawer__nav" aria-label="Основная навигация">{renderNavItems(PRIMARY_NAV)}<div className="travel-drawer__section" aria-label="Сервисы"><p>Сервисы</p>{renderNavItems(SERVICE_NAV)}</div></nav>
      <nav className="travel-drawer__account" aria-label="Аккаунт"><p>Аккаунт</p>{renderNavItems(ACCOUNT_NAV)}</nav>
    </aside>
  </div> : null;

  const tripScreen = selectedTrip ? <TripWorkspace trip={selectedTrip} tab={workspaceTab} onTab={setWorkspaceTab} onBack={() => navigate('trips')} onAsk={() => openTripAssistant(selectedTrip)} /> : <main className="travel-page"><EmptyState title="Поездка не найдена" text="Черновик отсутствует в текущем пользовательском контуре." action={<button className="travel-secondary" type="button" onClick={() => navigate('trips')}>К поездкам</button>} /></main>;

  return <div className="travel-app">
    {header}{drawer}
    <div className="travel-shell" data-storage={storageAvailable ? 'ready' : 'unavailable'}>
      {screen === 'home' ? <HomeScreen trips={trips} prompt={homePrompt} onPromptChange={setHomePrompt} onSubmitPrompt={submitHomePrompt} onNavigate={navigate} onOpenTrip={openTrip} /> : null}
      {screen === 'assistant' ? <AssistantScreen context={assistantContext} message={assistantMessage} status={assistantStatus} online={online} onSubmit={submitAssistantPrompt} onBackTrip={assistantContext.scope === 'trip' ? () => setScreen('trip') : undefined} onCreateTrip={() => navigate('create')} /> : null}
      {screen === 'trips' ? <TripsScreen trips={trips} onCreate={() => navigate('create')} onOpenTrip={openTrip} /> : null}
      {screen === 'create' ? <CreateTripScreen form={form} setForm={setForm} errors={errors} storageAvailable={storageAvailable} onSubmit={createTrip} onCancel={() => navigate('trips')} /> : null}
      {screen === 'trip' ? tripScreen : null}
      {screen === 'documents' ? <ServiceFoundation kicker="ДОКУМЕНТЫ" title="Документы" text="Загрузка и защищённая обработка travel-документов пока не подключены. Здесь не отображаются демонстрационные документы." onPrimary={() => navigate('trips')} primaryLabel="Открыть поездки" /> : null}
      {screen === 'routes' ? <ServiceFoundation kicker="МАРШРУТЫ" title="Поиск маршрутов" text="Транспортные провайдеры пока не подключены. Реальные рейсы, поезда, автобусы и цены не показываются." onPrimary={() => openGeneralAssistant('', 'service')} primaryLabel="Открыть ARVELIS AI" /> : null}
      {screen === 'budgetService' ? <ServiceFoundation kicker="БЮДЖЕТ" title="Бюджет поездки" text="Бюджет ведётся внутри конкретной поездки. Без provider-данных ARVELIS не рассчитывает и не подставляет цены автоматически." onPrimary={() => navigate('trips')} primaryLabel="Мои поездки" /> : null}
      {screen === 'legalService' ? <ServiceFoundation kicker="TRAVEL LEGAL" title="Проверка документов и правил" text="Юридический источник пока не подключён. ARVELIS не показывает неподтверждённые визовые или въездные требования." onPrimary={() => navigate('trips')} primaryLabel="Мои поездки" /> : null}
      {screen === 'mapService' ? <ServiceFoundation kicker="КАРТА" title="Карта путешествия" text="Картографический сервис пока не подключён. Фальшивая карта, улицы и маршруты не отображаются." onPrimary={() => navigate('trips')} primaryLabel="Мои поездки" /> : null}
      {screen === 'profile' ? <main className="travel-page travel-profile-slot">{renderProfile(() => setScreen('states'))}</main> : null}
      {screen === 'settings' ? <SettingsScreen onOpenDiagnostics={() => setScreen('states')} /> : null}
      {screen === 'help' ? <HelpScreen /> : null}
      {screen === 'states' ? <div className="travel-diagnostics"><button type="button" className="travel-back" onClick={() => setScreen('settings')}>← Настройки</button>{renderStates()}</div> : null}
    </div>
    <span className="travel-sr-only" aria-live="polite">Профиль: {profileName}. AI: {TRAVEL_CAPABILITY_STATE.aiProvider}.</span>
  </div>;
}
