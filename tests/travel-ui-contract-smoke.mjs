import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [
  app,
  assistant,
  workspace,
  home,
  createTrip,
  services,
  profile,
  domain,
  ui,
  previewAuth,
  realAuth,
  authStatus,
  accountSecurity,
  shellCss,
  polishCss,
  responsiveCss,
  main,
  rootApp,
  indexHtml,
] = await Promise.all([
  read('../src/travel/TravelApp.tsx'),
  read('../src/travel/AssistantScreen.tsx'),
  read('../src/travel/TripWorkspace.tsx'),
  read('../src/travel/HomeTripsScreens.tsx'),
  read('../src/travel/CreateTripScreen.tsx'),
  read('../src/travel/ServiceScreens.tsx'),
  read('../src/screens/ProfileScreen.tsx'),
  read('../src/travel/domain.ts'),
  read('../src/travel/ui.tsx'),
  read('../src/screens/AuthScreen.tsx'),
  read('../src/screens/RealAuthScreen.tsx'),
  read('../src/auth/AuthStatusPanel.tsx'),
  read('../src/auth/AccountSecurityPanel.tsx'),
  read('../src/travel/travel-v2-shell.css'),
  read('../src/travel/travel-v2-polish.css'),
  read('../src/travel/travel-v2-responsive.css'),
  read('../src/main.tsx'),
  read('../src/App.tsx'),
  read('../index.html'),
]);

// Startup/auth Safari guardrails remain intact.
assert.ok(rootApp.includes("useState<EntryScreen>(() => REAL_AUTH_ENABLED ? 'resolving' : 'auth')"));
assert.ok(rootApp.includes('realAuthGateway.restoreSession()'));
assert.ok(rootApp.includes("if (entry === 'resolving') return null"));
assert.ok(!indexHtml.includes('PRODUCT PREVIEW'));
assert.ok(indexHtml.includes('class="arvelis-travel-runtime"'));
for (const source of [previewAuth, realAuth]) {
  assert.ok(source.includes('variant="travel"'));
  assert.ok(source.includes('АССИСТЕНТ ПУТЕШЕСТВИЙ'));
  assert.ok(!source.includes('TRAVEL ASSISTANT'));
  assert.ok(!source.includes('workspace'));
}

// Create Trip is now a three-step mobile flow using the existing CreateTripInput/Trip save boundary.
for (const text of ['ШАГ {step} ИЗ 3', 'Куда и когда', 'Кто едет и какой бюджет', 'Что важно в путешествии', 'Продолжить', 'Создать поездку']) {
  assert.ok(createTrip.includes(text), `Create Trip wizard contract missing: ${text}`);
}
assert.ok(createTrip.includes("type Step = 1 | 2 | 3"));
assert.ok(createTrip.includes('travel-stepper'));
assert.ok(createTrip.includes('inputMode="numeric"'));
assert.ok(createTrip.includes("event.target.value.replace(/\\D/g, '')"));
assert.ok(createTrip.includes('formatMoney(form.budgetLimitRub)'));
assert.ok(createTrip.includes('getExactTripDuration(form.startDate, form.endDate)'));
assert.ok(!createTrip.includes('<span>Количество дней</span>'));
assert.ok(domain.includes('export function getExactTripDuration'));
assert.ok(domain.includes('durationDays: exactDuration?.days ?? input.durationDays'));
assert.ok(domain.includes("if (input.flexibleDates)"));
assert.ok(ui.includes('formatNights'));
assert.ok(ui.includes('formatTravelers'));

// Assistant is a chat workspace; accepted local messages clear the draft without fake replies.
assert.ok(assistant.includes('travel-chat-workspace'));
assert.ok(assistant.includes('Чем помочь с путешествием?'));
assert.ok(assistant.includes('Ассистент путешествий'));
assert.ok(assistant.includes('const accepted = onSubmit(event, draft)'));
assert.ok(assistant.includes("if (accepted) setDraft('')"));
assert.ok(assistant.includes('AI-планирование пока не подключено.'));
assert.ok(!assistant.includes('AI Gateway'));
assert.ok(!assistant.includes('AI-провайдер'));
assert.ok(!assistant.includes('Создать поездку вручную'));
assert.ok(assistant.includes("context.scope === 'general'"));
assert.ok(app.includes('messages={assistantMessages}'));
assert.ok(app.includes('setAssistantMessages((current) => [...current, message])'));
assert.ok(app.includes("onBackTrip={assistantContext.scope === 'trip'"));

// Navigation resets new-screen scroll but drawer lifecycle preserves its underlying position.
assert.ok(app.includes('useLayoutEffect'));
assert.ok(app.includes('resetContentScroll();'));
assert.ok(app.includes('drawerScrollRef.current = window.scrollY'));
assert.ok(app.includes('preserveDrawerScrollRef.current'));
assert.ok(app.includes("document.body.style.overflow = 'hidden'"));
assert.ok(app.includes('menuButtonRef.current?.focus()'));
assert.ok(app.includes("event.key === 'Escape'"));
assert.ok(app.includes('onPointerDown'));

// Profile is a compact account UI and diagnostics are feature-flagged out of normal navigation.
for (const label of ['Личные данные', 'Настройки поездок', 'Мои документы', 'Уведомления', 'Безопасность', 'Конфиденциальность', 'Помощь', 'О приложении', 'Выйти']) {
  assert.ok(profile.includes(label), `Profile row missing: ${label}`);
}
assert.ok(profile.includes('travel-profile__menu-row'));
assert.ok(!profile.includes('travel-profile__grid'));
assert.ok(services.includes("import.meta.env.DEV && import.meta.env.VITE_SHOW_DIAGNOSTICS === 'true'"));
assert.ok(app.includes("const DIAGNOSTICS_ENABLED = import.meta.env.DEV && import.meta.env.VITE_SHOW_DIAGNOSTICS === 'true'"));
assert.ok(!app.includes("label: 'Диагностика'"));

// Settings and active user-facing UI use consistent Russian terminology.
for (const label of ['Настройки поездок', 'Конфиденциальность', 'Безопасность', 'Расширенные настройки']) assert.ok(services.includes(label));
for (const forbidden of ['Travel preferences', 'Advanced / Diagnostics', 'TRIP WORKSPACE', 'Travel Legal', 'Trip Book', 'Travel Assistant', 'AI Gateway']) {
  for (const [name, source] of [['app', app], ['assistant', assistant], ['workspace', workspace], ['home', home], ['services', services], ['profile', profile], ['previewAuth', previewAuth], ['realAuth', realAuth], ['authStatus', authStatus], ['accountSecurity', accountSecurity]]) {
    assert.ok(!source.includes(forbidden), `${name} still exposes user-facing legacy term: ${forbidden}`);
  }
}
assert.ok(workspace.includes('ПЛАНИРОВАНИЕ ПОЕЗДКИ'));
assert.ok(workspace.includes('Книга поездки'));
assert.ok(workspace.includes('Юридическая проверка'));

// Home is compact, truthful, and keeps prompt fill-only behavior.
assert.ok(home.includes('ARVELIS AI · АССИСТЕНТ ПУТЕШЕСТВИЙ'));
assert.ok(home.includes('AI-планирование пока недоступно в этой версии.'));
assert.ok(home.includes('STARTER_PROMPTS.map'));
assert.ok(home.includes('onClick={() => onPromptChange(starter)}'));
assert.ok(!home.includes('provider'));
assert.ok(!home.includes('gateway'));
assert.ok(!home.includes('localStorage'));
assert.ok(polishCss.includes('.travel-ai-composer--hero textarea'));
assert.ok(polishCss.includes('min-height: 68px'));

// Service empty states are content- and icon-specific.
for (const icon of ['icon="document"', 'icon="route"', 'icon="budget"', 'icon="shield"', 'icon="map"']) assert.ok(app.includes(icon));
for (const text of [
  'Документы поездки',
  'Здесь ARVELIS будет сравнивать самолёты, поезда, автобусы и смешанные варианты.',
  'Проверка документов и правил',
  'Карта маршрута',
]) assert.ok(app.includes(text) || workspace.includes(text), `Service state missing: ${text}`);
assert.ok(services.includes('travel-service-foundation__icon'));
assert.ok(!services.includes('travel-service-foundation__visual'));

// Safari/mobile geometry and accessibility.
for (const contract of ['100dvh', 'env(safe-area-inset-bottom)', '.travel-stepper button', 'min-height: 48px', '.travel-date-input', 'color-scheme: light', '.travel-form-actions--wizard']) {
  assert.ok(polishCss.includes(contract), `Polish CSS contract missing: ${contract}`);
}
assert.ok(shellCss.includes('overflow-x: clip'));
assert.ok(responsiveCss.includes('@media (prefers-reduced-motion: reduce)'));
assert.ok(polishCss.includes('.travel-profile__menu-row'));
assert.ok(polishCss.includes('.travel-service-foundation__icon.is-route'));
assert.ok(polishCss.includes('.travel-service-foundation__icon.is-document'));
assert.ok(polishCss.includes('.travel-service-foundation__icon.is-shield'));
assert.ok(polishCss.includes('.travel-service-foundation__icon.is-map'));

// V2 polish must load after all previous Travel/Auth layers.
const authImport = main.indexOf("./travel/travel-v2-auth.css");
const polishImport = main.indexOf("./travel/travel-v2-polish.css");
assert.ok(authImport >= 0 && polishImport > authImport, 'Physical-device polish CSS must load last');

console.log('travel UI V2 contract smoke: PASS (physical iPhone polish)');
