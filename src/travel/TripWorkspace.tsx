import type { KeyboardEvent } from 'react';
import { BrandLockup } from '../components/Brand';
import { calculateBudget, type LegalCheck, type Trip } from './domain';
import {
  BUDGET_LABELS,
  EmptyState,
  LEGAL_SECTIONS,
  STATUS_LABELS,
  TRIP_BOOK_LABELS,
  formatDate,
  formatDateRange,
  formatDays,
  formatMoney,
  formatNights,
  formatTravelers,
} from './ui';

export type WorkspaceTab = 'overview' | 'itinerary' | 'map' | 'budget' | 'documents' | 'legal' | 'tripBook';

const TABS: Array<[WorkspaceTab, string]> = [
  ['overview', 'Обзор'],
  ['itinerary', 'Маршрут'],
  ['map', 'Карта'],
  ['budget', 'Бюджет'],
  ['documents', 'Документы'],
  ['legal', 'Правила'],
  ['tripBook', 'Книга поездки'],
];

function tripDateSummary(trip: Trip): string {
  if (!trip.startDate || !trip.endDate) return formatNights(trip.durationDays);
  const nights = Math.max(0, trip.durationDays - 1);
  return `${formatDateRange(trip.startDate, trip.endDate)} · ${formatNights(nights)} · ${formatDays(trip.durationDays)}`;
}

export function TripWorkspace({ trip, tab, onTab, onBack, onAsk }: {
  trip: Trip;
  tab: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  onBack: () => void;
  onAsk: () => void;
}) {
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, value: WorkspaceTab) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = TABS.findIndex(([candidate]) => candidate === value);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : event.key === 'ArrowRight' ? (index + 1) % TABS.length : (index - 1 + TABS.length) % TABS.length;
    const next = TABS[nextIndex]?.[0];
    if (!next) return;
    onTab(next);
    const tablist = event.currentTarget.closest('[role="tablist"]');
    tablist?.querySelector<HTMLButtonElement>(`[data-tab-value="${next}"]`)?.focus();
  };

  return <main className="travel-page travel-workspace">
    <button className="travel-back" type="button" onClick={onBack}>← Мои поездки</button>
    <section className="travel-workspace__hero">
      <div>
        <p className="travel-kicker">ПЛАНИРОВАНИЕ ПОЕЗДКИ</p>
        <h1>{trip.destination ?? 'Направление не выбрано'}</h1>
        <p>Из {trip.origin} · {tripDateSummary(trip)}</p>
      </div>
      <div className="travel-workspace__actions">
        <span className="travel-status travel-status--large">{STATUS_LABELS[trip.status]}</span>
        <button className="travel-primary travel-primary--compact" type="button" onClick={onAsk}>Спросить ARVELIS</button>
      </div>
    </section>

    <div className="travel-tabs" role="tablist" aria-label="Разделы поездки">
      {TABS.map(([value, label]) => <button
        key={value}
        type="button"
        role="tab"
        data-tab-value={value}
        aria-selected={tab === value}
        aria-controls={`travel-tab-${value}`}
        tabIndex={tab === value ? 0 : -1}
        className={tab === value ? 'is-active' : ''}
        onClick={() => onTab(value)}
        onKeyDown={(event) => onTabKeyDown(event, value)}
      >{label}</button>)}
    </div>

    <div id={`travel-tab-${tab}`} role="tabpanel">
      {tab === 'overview' ? <TripOverview trip={trip} /> : null}
      {tab === 'itinerary' ? <TripItinerary trip={trip} /> : null}
      {tab === 'map' ? <TripMap trip={trip} /> : null}
      {tab === 'budget' ? <TripBudget trip={trip} /> : null}
      {tab === 'documents' ? <EmptyState title="Документы поездки" text="Здесь будут храниться билеты, страховка, бронирования и другие документы." /> : null}
      {tab === 'legal' ? <TripLegal trip={trip} /> : null}
      {tab === 'tripBook' ? <TripBookView trip={trip} /> : null}
    </div>
  </main>;
}

function TripOverview({ trip }: { trip: Trip }) {
  const preferences = [...trip.preferences.vacationTypes, ...trip.preferences.interests, ...trip.preferences.transportPreferences];
  return <section className="travel-overview-grid">
    <article className="travel-panel travel-panel--summary">
      <p className="travel-kicker">КРАТКО О ПОЕЗДКЕ</p>
      <h2>{trip.destination ?? 'Направление не выбрано'}</h2>
      <dl>
        <div><dt>Маршрут</dt><dd>{trip.origin} → {trip.destination ?? 'подобрать'}</dd></div>
        <div><dt>Даты</dt><dd>{tripDateSummary(trip)}</dd></div>
        <div><dt>Путешественники</dt><dd>{formatTravelers(trip.travelers.length)}</dd></div>
        <div><dt>Бюджет</dt><dd>{formatMoney(trip.budget.limitRub)} ₽</dd></div>
      </dl>
    </article>
    <article className="travel-panel">
      <p className="travel-kicker">ПРЕДПОЧТЕНИЯ</p>
      <h2>Что важно</h2>
      {preferences.length > 0 ? <div className="travel-chip-row">{preferences.map((item) => <span key={item}>{item}</span>)}</div> : <p className="travel-muted">Предпочтения пока не выбраны.</p>}
      {trip.preferences.additionalNotes ? <p>{trip.preferences.additionalNotes}</p> : null}
    </article>
  </section>;
}

function TripItinerary({ trip }: { trip: Trip }) {
  if (trip.itinerary.length === 0) return <EmptyState title="Маршрут пока не добавлен" text="Здесь появится план поездки по дням." />;
  return <section className="travel-timeline">{trip.itinerary.map((day) => <article className="travel-day-card" key={day.day}>
    <div className="travel-day-card__number"><span>День</span><strong>{day.day}</strong></div>
    <div>
      <h2>{day.date ? formatDate(day.date) : `День ${day.day}`}</h2>
      {day.items.length === 0 ? <p>События не добавлены.</p> : <ol>{day.items.map((item) => <li key={item.id}>
        <time>{item.startsAt ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.startsAt)) : 'Время не указано'}</time>
        <div><strong>{item.title}</strong>{item.note ? <p>{item.note}</p> : null}</div>
      </li>)}</ol>}
    </div>
  </article>)}</section>;
}

function TripMap({ trip }: { trip: Trip }) {
  if (trip.mapPoints.length === 0) return <section className="travel-map-empty">
    <div className="travel-map-schematic" aria-hidden="true"><i /><i /><i /><span>⌖</span></div>
    <div><p className="travel-kicker">КАРТА</p><h2>Карта маршрута</h2><p>После подключения картографического сервиса здесь появится маршрут поездки.</p></div>
  </section>;
  return <section className="travel-panel"><p className="travel-kicker">ТОЧКИ ПОЕЗДКИ</p><h2>Сохранённые места</h2><div className="travel-point-list">{trip.mapPoints.map((point) => <div key={point.id}><strong>{point.label}</strong><span>{point.latitude !== undefined && point.longitude !== undefined ? `${point.latitude}, ${point.longitude}` : 'Координаты не указаны'}</span></div>)}</div></section>;
}

function TripBudget({ trip }: { trip: Trip }) {
  const hasActualItems = trip.budget.items.length > 0 || trip.budget.reserveRub > 0;
  const budget = calculateBudget(trip.budget);
  return <section className="travel-budget-v2">
    <div className="travel-budget-v2__hero"><span>Лимит бюджета</span><strong>{formatMoney(trip.budget.limitRub)} ₽</strong><p>Указано вами</p></div>
    {hasActualItems ? <div className="travel-budget-v2__metrics"><div><span>Расходы</span><strong>{formatMoney(budget.spentRub)} ₽</strong></div><div><span>Резерв</span><strong>{formatMoney(budget.reserveRub)} ₽</strong></div><div><span>Остаток</span><strong>{formatMoney(budget.remainingRub)} ₽</strong></div></div> : null}
    <article className="travel-panel travel-budget-v2__categories">
      <p className="travel-kicker">КАТЕГОРИИ</p>
      <h2>{trip.budget.items.length > 0 ? 'Добавленные расходы' : 'Структура бюджета'}</h2>
      {trip.budget.items.length > 0
        ? <div className="travel-budget-list">{trip.budget.items.map((item) => <div key={item.id}><span>{BUDGET_LABELS[item.category]} · {item.label}</span><strong>{formatMoney(item.amountRub)} ₽</strong></div>)}</div>
        : <><div className="travel-budget-category-grid">{Object.values(BUDGET_LABELS).map((label) => <span key={label}>{label}</span>)}</div><p>Расходы пока не добавлены.</p></>}
    </article>
  </section>;
}

function TripLegal({ trip }: { trip: Trip }) {
  if (trip.legalChecks.length === 0) return <section className="travel-legal">
    <div className="travel-panel"><p className="travel-kicker">ПРОВЕРКА ДОКУМЕНТОВ И ПРАВИЛ</p><h2>Проверка ещё не выполнена</h2><p>Здесь будут собраны правила въезда, транзита и требования к документам для вашей поездки.</p></div>
    <div className="travel-legal-grid">{LEGAL_SECTIONS.map((section) => <div key={section}><span>{section}</span><strong>Не проверено</strong></div>)}</div>
  </section>;
  return <section className="travel-legal"><div className="travel-legal-checks">{trip.legalChecks.map((check) => <LegalCheckCard key={check.id} check={check} />)}</div></section>;
}

function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function LegalCheckCard({ check }: { check: LegalCheck }) {
  const statusLabel = check.status === 'ready' ? 'Готово' : check.status === 'in_progress' ? 'Проверяется' : check.status === 'needs_review' ? 'Нужна проверка' : 'Не начато';
  return <article className="travel-panel"><p className="travel-kicker">{check.country}</p><h2>{statusLabel}</h2>{check.requirements.length === 0 ? <p>Подтверждённые требования пока не добавлены.</p> : <div className="travel-legal-requirements">{check.requirements.map((requirement) => {
    const sourceUrl = safeHttpUrl(requirement.sourceUrl);
    return <div key={requirement.id}><strong>{requirement.requirementType}</strong><p>{requirement.summary}</p>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{requirement.sourceName}</a> : <span>{requirement.sourceName}</span>}</div>;
  })}</div>}</article>;
}

function TripBookView({ trip }: { trip: Trip }) {
  return <section className="travel-tripbook">
    <div className="travel-tripbook__cover"><BrandLockup compact variant="travel" /><p>КНИГА ПОЕЗДКИ</p><h2>{trip.destination ?? trip.title}</h2><span>{tripDateSummary(trip)}</span></div>
    <div className="travel-tripbook__contents"><p className="travel-kicker">СОДЕРЖАНИЕ</p><h2>Книга поездки</h2>{trip.tripBook.sections.map((section, index) => <div key={section.key}><span>{String(index + 1).padStart(2, '0')}</span><strong>{TRIP_BOOK_LABELS[section.key] ?? section.key}</strong><em>{section.status === 'empty' ? 'Не заполнено' : section.status === 'draft' ? 'Черновик' : 'Готово'}</em></div>)}<p className="travel-capability-note">Экспорт книги поездки появится позже.</p></div>
  </section>;
}
