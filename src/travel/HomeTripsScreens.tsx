import type { FormEvent } from 'react';
import type { Trip } from './domain';
import { EmptyState, STARTER_PROMPTS, STATUS_LABELS, formatDate, formatMoney, formatUpdated } from './ui';

export function HomeScreen({ trips, prompt, onPromptChange, onSubmitPrompt, onNavigate, onOpenTrip }: {
  trips: Trip[];
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmitPrompt: (event: FormEvent<HTMLFormElement>) => void;
  onNavigate: (screen: 'trips' | 'create' | 'documents') => void;
  onOpenTrip: (tripId: string) => void;
}) {
  return <main className="travel-page travel-home">
    <section className="travel-ai-hero" aria-labelledby="travel-home-title">
      <div className="travel-ai-hero__halo" aria-hidden="true" />
      <p className="travel-kicker">ARVELIS AI · TRAVEL ASSISTANT</p>
      <h1 id="travel-home-title">Куда отправимся?</h1>
      <p className="travel-ai-hero__lead">Опишите поездку своими словами — направление, бюджет, даты или то, что для вас важно.</p>
      <form className="travel-ai-composer travel-ai-composer--hero" onSubmit={onSubmitPrompt}>
        <label className="travel-sr-only" htmlFor="travel-home-prompt">Запрос для ARVELIS AI</label>
        <textarea id="travel-home-prompt" value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder="Расскажите, куда хотите поехать или какой у вас бюджет…" rows={4} enterKeyHint="send" />
        <div className="travel-ai-composer__footer"><span>Текстовый запрос</span><button className="travel-ai-send" type="submit" disabled={!prompt.trim()} aria-label="Перейти в ARVELIS AI с этим запросом">→</button></div>
      </form>
      <div className="travel-starter-prompts" aria-label="Примеры запросов">{STARTER_PROMPTS.map((starter) => <button type="button" key={starter} onClick={() => onPromptChange(starter)}>{starter}</button>)}</div>
      <p className="travel-capability-note">AI пока не подключён: запрос откроется в ассистенте, но ответ не будет выдуман.</p>
    </section>

    <section className="travel-section">
      <div className="travel-section__heading"><div><p className="travel-kicker">ВАШИ ПОЕЗДКИ</p><h2>Последние поездки</h2></div>{trips.length > 0 ? <button className="travel-link" type="button" onClick={() => onNavigate('trips')}>Все поездки</button> : null}</div>
      {trips.length === 0 ? <EmptyState variant="compact" title="Поездок пока нет" text="Создайте первую поездку вручную. ARVELIS сохранит только введённые вами данные — без фиктивных рейсов, цен и рекомендаций." action={<button className="travel-secondary" type="button" onClick={() => onNavigate('create')}>Создать поездку</button>} /> : <div className="travel-card-grid">{trips.slice(0, 3).map((trip) => <TripCard key={trip.id} trip={trip} onOpen={() => onOpenTrip(trip.id)} />)}</div>}
    </section>

    <section className="travel-section travel-editorial" aria-labelledby="travel-editorial-title">
      <div className="travel-section__heading"><div><p className="travel-kicker">РЕДАКЦИОННЫЕ ИДЕИ · НЕ AI-РЕКОМЕНДАЦИИ</p><h2 id="travel-editorial-title">Идеи для планирования</h2></div></div>
      <div className="travel-editorial-grid">
        <article><span>01</span><h3>Начать с бюджета</h3><p>Сначала зафиксируйте общий лимит и длительность — так проще сравнивать будущие варианты.</p></article>
        <article><span>02</span><h3>Проверить документы</h3><p>До покупки невозвратных билетов стоит отдельно проверить правила въезда и транзита.</p></article>
        <article><span>03</span><h3>Собрать Trip Book</h3><p>По мере подготовки поездки храните подтверждённые детали в одном workspace.</p></article>
      </div>
    </section>

    <section className="travel-section travel-home-tools" aria-label="Подготовка к поездке">
      <button type="button" onClick={() => onNavigate('documents')}><span>Подготовка к поездке</span><strong>Документы</strong><em>Отдельный контур без фиктивных данных</em></button>
      <button type="button" onClick={() => onNavigate('trips')}><span>Trip Book</span><strong>Книга поездки</strong><em>Формируется внутри конкретной поездки</em></button>
    </section>
  </main>;
}

export function TripsScreen({ trips, onCreate, onOpenTrip }: { trips: Trip[]; onCreate: () => void; onOpenTrip: (tripId: string) => void }) {
  return <main className="travel-page">
    <div className="travel-title-row"><div><p className="travel-kicker">МОИ ПОЕЗДКИ</p><h1>Мои поездки</h1><p>Черновики и поездки, сохранённые в текущем пользовательском контуре.</p></div>{trips.length > 0 ? <button className="travel-primary travel-primary--compact" type="button" onClick={onCreate}>Создать поездку</button> : null}</div>
    {trips.length === 0 ? <EmptyState title="У вас пока нет поездок" text="Начните с основных параметров: откуда, направление, даты, состав и бюджет." action={<button className="travel-primary" type="button" onClick={onCreate}>Создать поездку</button>} /> : <div className="travel-card-grid">{trips.map((trip) => <TripCard key={trip.id} trip={trip} onOpen={() => onOpenTrip(trip.id)} />)}</div>}
  </main>;
}

export function TripCard({ trip, onOpen }: { trip: Trip; onOpen: () => void }) {
  return <button className="travel-trip-card" type="button" onClick={onOpen}>
    <div className="travel-trip-card__visual" aria-hidden="true"><span>ARVELIS</span></div>
    <div className="travel-trip-card__body">
      <div className="travel-trip-card__top"><span className="travel-status">{STATUS_LABELS[trip.status]}</span><span>{formatUpdated(trip.updatedAt)}</span></div>
      <h3>{trip.title}</h3><p>{trip.destination ?? 'Направление ещё не выбрано'}</p>
      <div className="travel-trip-card__meta"><span>{trip.startDate ? `${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}` : 'Гибкие даты'}</span><span>{trip.durationDays} дн.</span><span>{trip.travelers.length} чел.</span></div>
      <div className="travel-trip-card__budget"><span>Лимит бюджета</span><strong>{formatMoney(trip.budget.limitRub)} ₽</strong></div>
    </div>
  </button>;
}
