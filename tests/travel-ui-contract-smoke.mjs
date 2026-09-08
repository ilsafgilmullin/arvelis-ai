import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/travel/TravelApp.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/travel/travel-foundation-v1.css', import.meta.url), 'utf8');
const acceptanceCss = await readFile(new URL('../src/travel/travel-acceptance-v1.css', import.meta.url), 'utf8');
const domain = await readFile(new URL('../src/travel/domain.ts', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');

// Primary Travel navigation must replace Chat-first navigation.
for (const target of ["setScreen('home')", "setScreen('trips')", "setScreen('create')", "setScreen('profile')", "setScreen('trip')"]) {
  assert.ok(app.includes(target), `Missing Travel navigation target: ${target}`);
}
assert.ok(app.includes('Главная'));
assert.ok(app.includes('Поездки'));
assert.ok(app.includes('Создать'));
assert.ok(app.includes('Профиль'));
assert.ok(!app.includes("setScreen('chat')"), 'Travel shell must not navigate to Chat as a primary screen');

// Create Trip flow must perform a real local save and enter the saved Trip workspace.
assert.ok(app.includes('const trip = createTripDraft(form, ownerScopeId);'));
assert.ok(app.includes('repository.save(trip);'));
assert.ok(app.includes('setSelectedTripId(trip.id);'));
assert.ok(app.includes("setScreen('trip');"));
assert.ok(app.includes('repository.get(selectedTripId)'), 'Saved Trip must be reopenable from persistence');

// Required workspace sections are wired as navigable tabs.
for (const label of ['Обзор', 'Маршрут', 'Карта', 'Бюджет', 'Документы', 'Legal', 'Trip Book']) {
  assert.ok(app.includes(`'${label}'`) || app.includes(`>${label}<`) || app.includes(label), `Missing Trip workspace section: ${label}`);
}
assert.ok(app.includes('role="tablist"'));
assert.ok(app.includes('aria-selected={tab === value}'));

// Foundation truthfulness: absent providers must not look like real results.
for (const message of [
  'AI-план ещё не создан',
  'Маршрут по дням пока пуст',
  'Карта ещё не подключена',
  'Юридическая проверка не запускалась',
  'Автоматические цены отсутствуют',
  'PDF-генерация не включена в этот slice',
]) {
  assert.ok(app.includes(message), `Missing truth boundary copy: ${message}`);
}
assert.ok(domain.includes("sampleContentEnabled: false"));
assert.ok(domain.includes("aiProvider: 'not_connected'"));
assert.ok(domain.includes("mapProvider: 'not_connected'"));
assert.ok(domain.includes("legalProvider: 'not_connected'"));

// Foundation responsive/accessibility contracts.
for (const contract of [
  'env(safe-area-inset-top)',
  'env(safe-area-inset-bottom)',
  '@media(max-width:640px)',
  '@media(max-width:380px)',
  '@media(orientation:landscape)',
  '@media(prefers-reduced-motion:reduce)',
]) {
  assert.ok(css.includes(contract), `Missing responsive contract: ${contract}`);
}

// Acceptance override must load after the foundation layer so the 42px legacy chip rule cannot win.
const foundationImport = main.indexOf("./travel/travel-foundation-v1.css");
const acceptanceImport = main.indexOf("./travel/travel-acceptance-v1.css");
assert.ok(foundationImport >= 0, 'Travel foundation stylesheet import missing');
assert.ok(acceptanceImport > foundationImport, 'Acceptance stylesheet must load after Travel foundation styles');

// Every interactive control used by Create Trip has an effective ~44px or larger target.
assert.ok(css.includes('.travel-primary,.travel-secondary,.travel-link,.travel-back{min-height:44px'));
assert.ok(css.includes('.travel-form input,.travel-form textarea{width:100%;min-height:48px'));
assert.ok(css.includes('.travel-tabs button{flex:0 0 auto;min-height:44px'));
assert.ok(css.includes('.travel-bottom-nav button{min-height:48px'));
assert.ok(css.includes('.travel-brand-button{border:0;background:none;padding:4px;color:inherit;cursor:pointer;min-height:44px'));
assert.ok(acceptanceCss.includes('.travel-toggle {\n  min-height: 44px;'), 'Preference chips must override legacy 42px height');
assert.ok(acceptanceCss.includes('.travel-check {\n  min-height: 44px;'), 'Checkbox label target must be at least 44px');

// Mobile acceptance hardening: prevent page overflow, protect focus, and keep sticky actions clear of bottom nav/safe area.
assert.ok(acceptanceCss.includes('overflow-x: clip'));
assert.ok(acceptanceCss.includes('scroll-margin-block: 72px calc(150px + env(safe-area-inset-bottom))'));
assert.ok(acceptanceCss.includes('button:focus-visible'));
assert.ok(acceptanceCss.includes('bottom: calc(80px + env(safe-area-inset-bottom))'));
assert.ok(acceptanceCss.includes('@media (orientation: landscape) and (max-height: 520px)'));
assert.ok(acceptanceCss.includes('bottom: 76px'));

assert.ok(app.includes('aria-label="Основная навигация"'));
assert.ok(app.includes('aria-pressed={active}'));
assert.ok(app.includes('aria-live="polite"'));

console.log('travel UI contract smoke: PASS');
