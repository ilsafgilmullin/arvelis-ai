import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [app, assistant, workspace, home, createTrip, services, assistantContext, profile, brand, shellCss, homeCss, workspaceCss, responsiveCss, main, domain] = await Promise.all([
  read('../src/travel/TravelApp.tsx'),
  read('../src/travel/AssistantScreen.tsx'),
  read('../src/travel/TripWorkspace.tsx'),
  read('../src/travel/HomeTripsScreens.tsx'),
  read('../src/travel/CreateTripScreen.tsx'),
  read('../src/travel/ServiceScreens.tsx'),
  read('../src/travel/assistantContext.ts'),
  read('../src/screens/ProfileScreen.tsx'),
  read('../src/components/Brand.tsx'),
  read('../src/travel/travel-v2-shell.css'),
  read('../src/travel/travel-v2-home.css'),
  read('../src/travel/travel-v2-workspace.css'),
  read('../src/travel/travel-v2-responsive.css'),
  read('../src/main.tsx'),
  read('../src/travel/domain.ts'),
]);

// AI-first information architecture.
for (const label of ['Главная', 'ARVELIS AI', 'Мои поездки', 'Создать поездку', 'Документы', 'Маршруты', 'Бюджет', 'Travel Legal', 'Карта', 'Профиль', 'Настройки', 'Помощь']) {
  assert.ok(app.includes(`label: '${label}'`) || app.includes(`label: \"${label}\"`) || app.includes(`>${label}<`) || app.includes(label), `Missing navigation label: ${label}`);
}
assert.ok(home.includes('Куда отправимся?'), 'Home must be AI-first');
assert.ok(home.includes('StarterPrompt'), 'Home starter prompts missing');
assert.ok(app.includes("createGeneralAssistantContext('assistant')"), 'General assistant context missing');
assert.ok(app.includes('createTripAssistantContext(trip)'), 'Trip-scoped assistant context missing');
assert.ok(assistantContext.includes("scope: 'general'"));
assert.ok(assistantContext.includes("scope: 'trip'"));

// No legacy primary bottom navigation in active Travel shell.
assert.ok(!app.includes('travel-bottom-nav'), 'Legacy bottom navigation must not be rendered');
assert.ok(!app.includes("setScreen('chat')"), 'Legacy chat screen must not be primary Travel navigation');

// Drawer accessibility and lifecycle.
for (const contract of [
  'aria-expanded={menuOpen}',
  'aria-controls="travel-navigation-drawer"',
  'role="dialog"',
  'aria-modal="true"',
  "event.key === 'Escape'",
  "event.key !== 'Tab'",
  "document.body.style.overflow = 'hidden'",
  'document.body.style.overflow = previousOverflow',
  'menuButtonRef.current?.focus()',
  'onPointerDown',
]) assert.ok(app.includes(contract), `Drawer contract missing: ${contract}`);
assert.ok(app.includes('aria-current={isNavSelected(item) ? \'page\' : undefined}'), 'Selected navigation state missing');

// Real local Trip create/save/reopen boundary remains intact.
for (const contract of [
  'validateCreateTripInput(form)',
  'createTripDraft(form, ownerScopeId)',
  'repository.save(trip)',
  'repository.list()',
  'repository.get(selectedTripId)',
]) assert.ok(app.includes(contract), `Trip persistence contract missing: ${contract}`);
assert.ok(createTrip.includes('Сохранить поездку'));
assert.ok(!createTrip.includes('Найти варианты с ARVELIS AI'), 'Unavailable AI CTA must not impersonate a working action');

// Truthful AI/provider states only.
for (const text of [
  'ARVELIS AI пока не подключён',
  'Ответы не генерируются и не имитируются',
  'Маршрут по дням пока пуст',
  'Карта будет доступна после подключения картографического сервиса',
  'Юридическая проверка ещё не выполнялась',
  'PDF-генерация пока не подключена',
  'Документы не добавлены',
]) assert.ok(assistant.includes(text) || workspace.includes(text), `Truthful state missing: ${text}`);
assert.ok(domain.includes("sampleContentEnabled: false"));
assert.ok(domain.includes("aiProvider: 'not_connected'"));
assert.ok(domain.includes("mapProvider: 'not_connected'"));
assert.ok(domain.includes("legalProvider: 'not_connected'"));
assert.ok(!assistant.includes('MOCK'), 'Assistant must not render mock answers');

// Workspace navigation and keyboard behavior.
for (const label of ['Обзор', 'Маршрут', 'Карта', 'Бюджет', 'Документы', 'Legal', 'Trip Book']) assert.ok(workspace.includes(label));
assert.ok(workspace.includes('role="tablist"'));
assert.ok(workspace.includes('role="tab"'));
assert.ok(workspace.includes('aria-selected={tab === value}'));
for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) assert.ok(workspace.includes(key), `Tab keyboard key missing: ${key}`);
assert.ok(workspace.includes('Спросить ARVELIS'));

// Simplified profile; diagnostics live in dev-only Settings.
assert.ok(profile.includes('Редактировать профиль'));
assert.ok(profile.includes('Настройки поездок'));
assert.ok(profile.includes('Мои документы'));
assert.ok(!profile.includes('Диагностика preview'), 'Technical diagnostics must not dominate Profile');
assert.ok(services.includes('import.meta.env.DEV'));
assert.ok(services.includes('Advanced / Diagnostics'));

// Travel logo keeps geometry while adding a light colorway.
assert.ok(brand.includes("variant?: 'classic' | 'travel'"));
assert.ok(brand.includes('M59 10a50 50 0 0 0 0 100'));
assert.ok(brand.includes('M35 84 57 29h9l22 55H75L61.5 48 48 84'));
assert.ok(brand.includes('#0b8f8f'));
assert.ok(brand.includes('#2563b8'));

// Design tokens and touch/accessibility contracts.
for (const token of [
  '--travel-background-primary', '--travel-background-secondary', '--travel-surface', '--travel-surface-elevated',
  '--travel-text-primary', '--travel-text-secondary', '--travel-border', '--travel-accent-teal', '--travel-accent-blue',
  '--travel-accent-green', '--travel-gradient-primary', '--travel-success', '--travel-warning', '--travel-danger',
  '--travel-focus', '--travel-shadow-sm', '--travel-shadow-md', '--travel-radius-sm', '--travel-radius-md', '--travel-radius-lg',
  '--travel-touch: 44px', '--travel-input: 48px',
]) assert.ok(shellCss.includes(token), `Design token missing: ${token}`);
assert.ok(shellCss.includes('overflow-x: clip'));
assert.ok(shellCss.includes('button:focus-visible'));
assert.ok(workspaceCss.includes('.travel-tabs { display: flex;'));
assert.ok(workspaceCss.includes('overflow-x: auto'));
assert.ok(workspaceCss.includes('min-height: var(--travel-touch)'));
assert.ok(homeCss.includes('min-height: var(--travel-touch)'));

// Mobile-first / safe-area / reduced-motion contract.
for (const contract of [
  'env(safe-area-inset-top)', 'env(safe-area-inset-right)', 'env(safe-area-inset-bottom)', 'env(safe-area-inset-left)',
]) assert.ok(shellCss.includes(contract) || responsiveCss.includes(contract), `Safe-area contract missing: ${contract}`);
for (const contract of [
  '@media (max-width: 980px)', '@media (max-width: 700px)', '@media (max-width: 390px)',
  '@media (orientation: landscape) and (max-height: 520px)', '@media (prefers-reduced-motion: reduce)',
]) assert.ok(responsiveCss.includes(contract), `Responsive contract missing: ${contract}`);

// V2 styles load after Foundation V1 and acceptance hardening.
const foundationImport = main.indexOf("./travel/travel-foundation-v1.css");
const acceptanceImport = main.indexOf("./travel/travel-acceptance-v1.css");
const v2ShellImport = main.indexOf("./travel/travel-v2-shell.css");
const v2ResponsiveImport = main.indexOf("./travel/travel-v2-responsive.css");
assert.ok(foundationImport >= 0 && acceptanceImport > foundationImport);
assert.ok(v2ShellImport > acceptanceImport);
assert.ok(v2ResponsiveImport > v2ShellImport);

console.log('travel UI V2 contract smoke: PASS');
