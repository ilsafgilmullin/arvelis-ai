import type { ReactNode } from 'react';
import type { BudgetCategory, CreateTripInput, TripStatus } from './domain';

export const STATUS_LABELS: Record<TripStatus, string> = {
  draft: 'Черновик', planning: 'Планирование', ready: 'Готово', active: 'В поездке', completed: 'Завершено', archived: 'Архив',
};

export const VACATION_TYPES = ['Море', 'Город', 'Природа', 'Культура', 'Активный отдых', 'Спокойный отдых'];
export const INTERESTS = ['Еда', 'История', 'Архитектура', 'Пляжи', 'Музеи', 'Прогулки', 'Природа'];
export const TRANSPORT = ['Самолёт', 'Поезд', 'Автобус', 'Автомобиль', 'Минимум пересадок'];
export const STARTER_PROMPTS = ['Куда поехать на 80 000 ₽', 'Найти выгодный маршрут', 'Проверить правила въезда', 'Спланировать поездку'];

export const BUDGET_LABELS: Record<BudgetCategory, string> = {
  transport: 'Транспорт', stay: 'Жильё', food: 'Питание', localTransport: 'Местный транспорт', activities: 'Активности',
  insurance: 'Страховка', visaAndFees: 'Виза и сборы', other: 'Другое', reserve: 'Резерв',
};

export const LEGAL_SECTIONS = ['Въезд', 'Транзит', 'Паспорт', 'Виза', 'Страховка', 'Таможня', 'Лекарства', 'Транспортные правила'];

export const TRIP_BOOK_LABELS: Record<string, string> = {
  cover: 'Обложка', overview: 'Обзор', documents: 'Документы', transport: 'Транспорт', stay: 'Жильё', itinerary: 'Маршрут',
  map: 'Карта', budget: 'Бюджет', legal: 'Legal', usefulInfo: 'Useful info', emergencyContacts: 'Экстренные контакты',
};

export const EMPTY_FORM: CreateTripInput = {
  origin: '', destination: '', destinationUnknown: false, startDate: '', endDate: '', flexibleDates: false,
  durationDays: 7, travelerCount: 2, budgetLimitRub: 120000, vacationTypes: [], interests: [], transportPreferences: [], additionalNotes: '',
};

export function formatDate(value?: string): string {
  if (!value) return 'Гибкие даты';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

export function formatUpdated(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

export function ToggleGroup({ values, selected, onChange }: { values: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  return <div className="travel-toggle-grid">{values.map((value) => {
    const active = selected.includes(value);
    return <button type="button" key={value} className={active ? 'travel-toggle is-active' : 'travel-toggle'} aria-pressed={active}
      onClick={() => onChange(active ? selected.filter((item) => item !== value) : [...selected, value])}>{value}</button>;
  })}</div>;
}

export function EmptyState({ title, text, action, variant = 'default' }: { title: string; text: string; action?: ReactNode; variant?: 'default' | 'compact' }) {
  return <section className={`travel-empty travel-empty--${variant}`} role="status"><div className="travel-empty__mark" aria-hidden="true">A</div><h2>{title}</h2><p>{text}</p>{action}</section>;
}
