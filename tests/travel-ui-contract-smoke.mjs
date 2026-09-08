import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [app, assistant, workspace, home, createTrip, services, assistantContext, profile, brand, shellCss, homeCss, workspaceCss, responsiveCss, authCss, main, domain, ui, rootApp, previewAuth, realAuth, indexHtml] = await Promise.all([
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
  read('../src/travel/travel-v2-auth.css'),
  read('../src/main.tsx'),
  read('../src/travel/domain.ts'),
  read('../src/travel/ui.tsx'),
  read('../src/App.tsx'),
  read('../src/screens/AuthScreen.tsx'),
  read('../src/screens/RealAuthScreen.tsx'),
  read('../index.html'),
]);

// Safari acceptance: startup resolves session directly to App/Auth with no active splash or Smart Entry.
assert.ok(rootApp.includes("useState<EntryScreen>(() => REAL_AUTH_ENABLED ? 'resolving' : 'auth')"), 'Startup must resolve session before choosing App/Auth');
assert.ok(rootApp.includes('realAuthGateway.restoreSession()'), 'Server session must be restored before rendering Auth');
assert.ok(rootApp.includes("if (entry === 'resolving') return null"), 'Session resolution must not render a fake login form');
for (const forbidden of ['WelcomeScreen', 'AppBootScreen', "entry === 'splash'", "entry === 'boot'", 'waitForBootPaint']) {
  assert.ok(!rootApp.includes(forbidden), `Active startup still contains legacy splash/boot contract: ${forbidden}`);
}
assert.ok(!indexHtml.includes('arvelis-preboot'), 'Static preboot splash must be removed');
assert.ok(!indexHtml.includes('PRODUCT PREVIEW'), 'Static PRODUCT PREVIEW screen must be removed');
assert.ok(indexHtml.includes('class="arvelis-travel-runtime"'), 'Travel runtime class missing from first HTML paint');
assert.ok(indexHtml.includes('name="theme-color" content="#f7fbfc"'), 'First paint theme color must be light');
assert.ok(indexHtml.includes('name="color-scheme" content="light"'), 'First paint color scheme must be light');

// Auth is light/travel-branded and truthful in preview; real Email OTP stays real.
for (const source of [previewAuth, realAuth]) assert.ok(source.includes('variant="travel"'), 'Active Auth must use teal/blue Travel BrandMark');
assert.ok(previewAuth.includes('data-auth-mode="preview"'));
assert.ok(previewAuth.includes('Предварительная версия'));
assert.ok(previewAuth.includes('Продолжить в режиме предварительного просмотра'));
assert.ok(!previewAuth.includes('auth-mode-switch'), 'Preview Auth must not imitate sign-in/register modes');
assert.ok(!previewAuth.includes('localStorage'));
assert.ok(!previewAuth.includes('серверн'));
assert.ok(!previewAuth.includes('provider'));
assert.ok(realAuth.includes('data-auth-mode="server"'));
assert.ok(realAuth.includes('Код из письма'));
assert.ok(realAuth.includes('Получить код'));
assert.ok(authCss.includes('--auth-bg: #f7fbfc'));
assert.ok(authCss.includes('background: rgba(255, 255, 255, .94)'));
assert.ok(!authCss.includes('--gold'), 'Active Auth V2 layer must not depend on legacy gold tokens');

// AI-first information architecture.
for (const label of ['Главная', 'ARVELIS AI', 'Мои поездки', 'Создать поездку', 'Документы', 'Маршруты', 'Бюджет', 'Travel Legal', 'Карта', 'Профиль', 'Настройки', 'Помощь']) {
  assert.ok(app.includes(`label: '${label}'`) || app.includes(`>${label}<`) || app.includes(label), `Missing navigation label: ${label}`);
}
assert.ok(home.includes('Куда отправимся?'), 'Home must be AI-first');
assert.ok(home.includes('STARTER_PROMPTS.map'), 'Home must render starter prompts');
assert.ok(home.includes('onClick={() => onPromptChange(starter)}'), 'Starter prompt must fill the composer instead of auto-sending');
for (const prompt of ['Куда поехать на 80 000 ₽', 'Найти выгодный маршрут', 'Проверить правила въезда', 'Спланировать поездку']) assert.ok(ui.includes(prompt), `Starter prompt missing: ${prompt}`);
assert.ok(app.includes("createGeneralAssistantContext('assistant')"), 'General assistant context missing');
assert.ok(app.includes('createTripAssistantContext(trip)'), 'Trip-scoped assistant context missing');
assert.ok(assistantContext.includes("scope: 'general'"));
assert.ok(assistantContext.includes("scope: 'trip'"));

// No legacy primary bottom navigation / connection indicator in active Travel shell.
assert.ok(!app.includes('travel-bottom-nav'), 'Legacy bottom navigation must not be rendered');
assert.ok(!app.includes("setScreen('chat')"), 'Legacy chat screen must not be primary Travel navigation');
assert.ok(!app.includes('travel-header__status'), 'User-facing Online/Offline indicator must not be rendered in Travel header');
assert.ok(!app.includes('travel-online-dot'), 'Travel header must not imply AI/provider availability');
assert.ok(app.includes('<NavIcon screen={item.screen} />'), 'Drawer navigation icons missing');

// Drawer accessibility and lifecycle.
for (const contract of [
  'aria-expanded={menuOpen}', 'aria-controls="travel-navigation-drawer"', 'role="dialog"', 'aria-modal="true"',
  "event.key === 'Escape'", "event.key !== 'Tab'", "document.body.style.overflow = 'hidden'",
  'document.body.style.overflow = previousOverflow', 'menuButtonRef.current?.focus()', 'onPointerDown',
]) assert.ok(app.includes(contract), `Drawer contract missing: ${contract}`);
assert.ok(app.includes('aria-current={isNavSelected(item) ? \'page\' : undefined}'), 'Selected navigation state missing');
assert.ok(shellCss.includes('width: min(86vw, 340px)'), 'Mobile drawer must be bounded to min(86vw, 340px)');
assert.ok(shellCss.includes('min-height: 50px'), 'Drawer rows must use compact touch-safe height');

// Real local Trip create/save/reopen boundary remains intact.
for (const contract of ['validateCreateTripInput(form)', 'createTripDraft(form, ownerScopeId)', 'repository.save(trip)', 'repository.list()', 'repository.get(selectedTripId)']) {
  assert.ok(app.includes(contract), `Trip persistence contract missing: ${contract}`);
}
assert.ok(createTrip.includes('Сохранить поездку'));
assert.ok(!createTrip.includes('Найти варианты с ARVELIS AI'), 'Unavailable AI CTA must not impersonate a working action');

// Truthful AI/provider states only.
for (const text of ['ARVELIS AI пока не подключён', 'Ответы не генерируются и не имитируются', 'Маршрут по дням пока пуст', 'Карта будет доступна после подключения картографического сервиса', 'Юридическая проверка ещё не выполнялась', 'PDF-генерация пока не подключена', 'Документы не добавлены']) {
  assert.ok(assistant.includes(text) || workspace.includes(text), `Truthful state missing: ${text}`);
}
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

// Design tokens, light runtime and iOS focus contracts.
for (const token of ['--travel-background-primary', '--travel-background-secondary', '--travel-surface', '--travel-text-primary', '--travel-border', '--travel-accent-teal', '--travel-accent-blue', '--travel-accent-green', '--travel-gradient-primary', '--travel-focus', '--travel-focus-width: 2px', '--travel-touch: 44px', '--travel-input: 48px']) {
  assert.ok(shellCss.includes(token), `Design token missing: ${token}`);
}
assert.ok(shellCss.includes('html.arvelis-travel-runtime body'));
assert.ok(shellCss.includes('background: #f7fbfc'));
assert.ok(shellCss.includes('overflow-x: clip'));
assert.ok(homeCss.includes('.travel-ai-composer:focus-within'));
assert.ok(homeCss.includes('0 0 0 var(--travel-focus-width)'));
assert.ok(homeCss.includes('.travel-ai-composer textarea:focus-visible { outline: 0; }'));
assert.ok(workspaceCss.includes('.travel-tabs { display: flex;'));
assert.ok(workspaceCss.includes('overflow-x: auto'));

// Mobile hero/prompt regressions from physical iPhone Safari acceptance.
assert.ok(responsiveCss.includes('.travel-ai-hero { padding: 26px 0 22px; }'), 'Mobile Home hero must be compact');
assert.ok(responsiveCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'), 'Starter prompts must use wrapping/grid layout');
assert.ok(responsiveCss.includes('.travel-starter-prompts button'));
assert.ok(responsiveCss.includes('white-space: normal'));
assert.ok(!responsiveCss.includes('flex-wrap: nowrap'), 'Starter prompts must not revert to nowrap horizontal clipping');
assert.ok(!responsiveCss.includes('.travel-starter-prompts::-webkit-scrollbar'), 'Starter prompts must not be a hidden horizontal scroller');

// Mobile-first / safe-area / reduced-motion contract.
for (const contract of ['env(safe-area-inset-top)', 'env(safe-area-inset-right)', 'env(safe-area-inset-bottom)', 'env(safe-area-inset-left)']) {
  assert.ok(shellCss.includes(contract) || responsiveCss.includes(contract), `Safe-area contract missing: ${contract}`);
}
for (const contract of ['@media (max-width: 980px)', '@media (max-width: 700px)', '@media (max-width: 390px)', '@media (orientation: landscape) and (max-height: 520px)', '@media (prefers-reduced-motion: reduce)']) {
  assert.ok(responsiveCss.includes(contract), `Responsive contract missing: ${contract}`);
}

// V2 styles load after Foundation V1 and active Auth V2 is last.
const foundationImport = main.indexOf("./travel/travel-foundation-v1.css");
const acceptanceImport = main.indexOf("./travel/travel-acceptance-v1.css");
const v2ShellImport = main.indexOf("./travel/travel-v2-shell.css");
const v2ResponsiveImport = main.indexOf("./travel/travel-v2-responsive.css");
const v2AuthImport = main.indexOf("./travel/travel-v2-auth.css");
assert.ok(foundationImport >= 0 && acceptanceImport > foundationImport);
assert.ok(v2ShellImport > acceptanceImport);
assert.ok(v2ResponsiveImport > v2ShellImport);
assert.ok(v2AuthImport > v2ResponsiveImport);
assert.ok(!main.includes('smart-entry.css'), 'Legacy Smart Entry CSS must not remain active');
assert.ok(!main.includes('smart-entry-responsive.css'), 'Legacy Smart Entry responsive CSS must not remain active');

console.log('travel UI V2 contract smoke: PASS');
