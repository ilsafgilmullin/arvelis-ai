import type { NormalizedTransportMode, NormalizedTransportRoute, TransportSearchResponse } from './transportContracts';
import { evaluateTransportRoutePolicy, getTransportRouteMetrics } from './transportContracts';
import { TransportProviderAttribution, YandexRaspProviderAttribution } from './TransportProviderAttribution';
import { EmptyState } from './ui';

const MODE_LABELS: Record<NormalizedTransportMode, string> = {
  flight: 'Самолёт',
  train: 'Поезд',
  bus: 'Автобус',
  suburbanRail: 'Электричка',
  transfer: 'Трансфер',
  ferry: 'Паром',
  car: 'Автомобиль',
  other: 'Транспорт',
};

function formatOffsetDateTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day, hour, minute, offset] = match;
  const zone = offset === 'Z' ? 'UTC' : `UTC${offset}`;
  return `${day}.${month}.${year}, ${hour}:${minute} · ${zone}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} мин`;
  if (remainder === 0) return `${hours} ч`;
  return `${hours} ч ${remainder} мин`;
}

function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

function availabilityText(route: NormalizedTransportRoute, authoritative: boolean): string {
  if (!authoritative) return 'Наличие мест не подтверждено';
  if (route.availability === 'available') return 'Места доступны';
  if (route.availability === 'limited') return 'Мест мало';
  if (route.availability === 'unavailable') return 'Мест нет';
  return 'Наличие мест не подтверждено';
}

function RouteCard({ route, response, now }: { route: NormalizedTransportRoute; response: TransportSearchResponse; now: Date }) {
  const first = route.segments[0]!;
  const last = route.segments.at(-1)!;
  const metrics = getTransportRouteMetrics(route);
  const policy = evaluateTransportRoutePolicy(route, response, now);
  const carrier = route.segments.map((segment) => segment.carrierName).find((value): value is string => Boolean(value));
  const serviceNumber = route.segments.map((segment) => segment.serviceNumber).find((value): value is string => Boolean(value));

  return <article className="travel-transport-card" data-freshness={policy.freshness}>
    <div className="travel-transport-card__topline">
      <span className="travel-transport-card__mode">{MODE_LABELS[first.mode]}</span>
      <span>{metrics.transferCount === 0 ? 'Без пересадок' : `${metrics.transferCount} перес.`}</span>
    </div>

    <div className="travel-transport-card__route">
      <div>
        <strong>{first.from.label}</strong>
        <span>{formatOffsetDateTime(first.departureAt)}</span>
      </div>
      <div className="travel-transport-card__duration" aria-label={`В пути ${formatDuration(metrics.durationMinutes)}`}>
        <span>{formatDuration(metrics.durationMinutes)}</span>
        <i aria-hidden="true" />
      </div>
      <div>
        <strong>{last.to.label}</strong>
        <span>{formatOffsetDateTime(last.arrivalAt)}</span>
      </div>
    </div>

    <div className="travel-transport-card__facts">
      <div>
        <span>Перевозчик</span>
        <strong>{carrier ?? 'Не указан'}{serviceNumber ? ` · ${serviceNumber}` : ''}</strong>
      </div>
      <div>
        <span>Цена</span>
        <strong>{policy.priceAuthoritative && route.price
          ? `${route.price.semantics === 'from' ? 'от ' : ''}${formatMoney(route.price.amountMinor, route.price.currency)}`
          : 'Не подтверждена'}</strong>
      </div>
      <div>
        <span>Места</span>
        <strong>{availabilityText(route, policy.availabilityAuthoritative)}</strong>
      </div>
    </div>

    {policy.freshness === 'expired'
      ? <p className="travel-transport-card__notice is-warning">Данные устарели. Для актуального расписания нужен новый поиск.</p>
      : policy.freshness === 'unspecified'
        ? <p className="travel-transport-card__notice">Актуальность этих данных не подтверждена провайдером.</p>
        : null}
  </article>;
}

export function TransportResultsScreen({ response, emptyText, onPrimary, primaryLabel }: {
  response: TransportSearchResponse | null;
  emptyText: string;
  onPrimary: () => void;
  primaryLabel: string;
}) {
  if (response === null) {
    return <main className="travel-page travel-transport-results">
      <div className="travel-title-row">
        <div><p className="travel-kicker">МАРШРУТЫ</p><h1>Маршруты</h1></div>
      </div>
      <EmptyState
        title="Маршруты пока не найдены"
        text={emptyText}
        action={<button className="travel-primary" type="button" onClick={onPrimary}>{primaryLabel}</button>}
      />
    </main>;
  }

  const now = new Date();
  const attribution = response.metadata?.attribution;
  const partial = response.metadata?.coverage.status === 'partial';

  return <main className="travel-page travel-transport-results" data-provider={response.providerId}>
    <div className="travel-title-row">
      <div>
        <p className="travel-kicker">МАРШРУТЫ</p>
        <h1>Найденные варианты</h1>
        <p>{response.routes.length > 0 ? `Вариантов: ${response.routes.length}` : 'Подходящих вариантов не найдено'}</p>
      </div>
    </div>

    {partial ? <div className="travel-alert" role="status">Показана только часть доступных результатов. Данные не следует считать полным списком.</div> : null}

    {response.routes.length > 0
      ? <section className="travel-transport-results__provider-block" aria-label="Результаты поиска транспорта">
          <div className="travel-transport-results__list">
            {response.routes.map((route) => <RouteCard key={route.id} route={route} response={response} now={now} />)}
          </div>
          {attribution?.required
            ? response.providerId === 'yandex-rasp-v3'
              ? <YandexRaspProviderAttribution attribution={attribution} />
              : <TransportProviderAttribution attribution={attribution} />
            : null}
        </section>
      : <EmptyState title="Рейсы не найдены" text="Провайдер вернул корректный пустой результат для этого запроса." />}
  </main>;
}
