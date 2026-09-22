import { useEffect, useRef, useState } from 'react';
import type { Trip } from './domain';
import { searchRoutesForTrip, type RoutesSearchClientOutcome, type RoutesSearchSelection } from './routesSearchClient';
import { TransportResultsScreen } from './TransportResultsScreen';

const ERROR_TEXT: Record<string, string> = {
  timeout: 'Поиск занял слишком много времени. Попробуйте ещё раз.',
  network_error: 'Не удалось связаться с сервером маршрутов. Проверьте соединение и повторите попытку.',
  invalid_response: 'Сервер вернул некорректный ответ. Повторите поиск позже.',
  transport_contract_violation: 'Ответ провайдера не прошёл проверку ARVELIS. Данные не показаны.',
  trip_not_found: 'Поездка больше недоступна или у аккаунта нет к ней доступа.',
  unauthorized: 'Сессия завершена. Войдите снова и повторите поиск.',
};

type RoutesUiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | Extract<RoutesSearchClientOutcome, { status: 'needs_disambiguation' | 'ready' | 'offline' | 'failed' }>;

export function RoutesScreen({ trip, online, onChooseTrip }: {
  trip: Trip | null;
  online: boolean;
  onChooseTrip: () => void;
}) {
  const [state, setState] = useState<RoutesUiState>({ status: 'idle' });
  const [selection, setSelection] = useState<RoutesSearchSelection>({});
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setSelection({});
    setState({ status: 'idle' });
    return () => requestRef.current?.abort();
  }, [trip?.id]);

  const runSearch = (nextSelection: RoutesSearchSelection = selection) => {
    if (!trip || state.status === 'loading') return;
    if (!online) {
      setState({ status: 'offline' });
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState({ status: 'loading' });

    void searchRoutesForTrip({ tripId: trip.id, selection: nextSelection, signal: controller.signal }).then((outcome) => {
      if (controller.signal.aborted) return;
      if (outcome.status === 'cancelled') return;
      setState(outcome);
    }).finally(() => {
      if (requestRef.current === controller) requestRef.current = null;
    });
  };

  const chooseCandidate = (field: 'origin' | 'destination', locationId: string) => {
    const nextSelection: RoutesSearchSelection = field === 'origin'
      ? { ...selection, originLocationId: locationId }
      : { ...selection, destinationLocationId: locationId };
    setSelection(nextSelection);
    runSearch(nextSelection);
  };

  if (!trip) {
    return <TransportResultsScreen
      response={null}
      emptyText="Выберите сохранённую поездку, чтобы ARVELIS использовал её точки отправления и назначения."
      onPrimary={onChooseTrip}
      primaryLabel="Выбрать поездку"
    />;
  }

  if (state.status === 'ready') {
    return <TransportResultsScreen
      response={state.response}
      emptyText="Подходящих вариантов не найдено."
      onPrimary={() => runSearch()}
      primaryLabel="Обновить поиск"
    />;
  }

  return <main className="travel-page travel-transport-results">
    <div className="travel-title-row">
      <div>
        <p className="travel-kicker">МАРШРУТЫ</p>
        <h1>{trip.origin} → {trip.destination || 'назначение не выбрано'}</h1>
        <p>{trip.title}</p>
      </div>
    </div>

    {state.status === 'loading' ? <div className="travel-alert" role="status" aria-live="polite">Ищем актуальные варианты маршрута…</div> : null}

    {state.status === 'needs_disambiguation' ? <section aria-labelledby="routes-disambiguation-title">
      <div className="travel-alert" role="status">
        <strong id="routes-disambiguation-title">Уточните {state.field === 'origin' ? 'точку отправления' : 'пункт назначения'}</strong>
        <p>ARVELIS не выбирает неоднозначное место автоматически.</p>
      </div>
      <div className="travel-transport-results__list">
        {state.candidates.map((candidate) => <button
          key={candidate.locationId}
          className="travel-secondary"
          type="button"
          onClick={() => chooseCandidate(state.field, candidate.locationId)}
        >{candidate.displayName}{candidate.region ? ` · ${candidate.region}` : ''}</button>)}
      </div>
    </section> : null}

    {state.status === 'offline' ? <div className="travel-alert" role="alert">Нет соединения. Маршруты не подменяются локальными или демонстрационными данными.</div> : null}

    {state.status === 'failed' ? <div className="travel-alert" role="alert">{ERROR_TEXT[state.code] ?? 'Не удалось получить маршруты. Повторите попытку.'}</div> : null}

    {state.status === 'idle' && !trip.destination ? <div className="travel-alert" role="status">В поездке пока не указан пункт назначения. Сначала заполните поездку.</div> : null}

    <div className="travel-actions">
      <button
        className="travel-primary"
        type="button"
        disabled={state.status === 'loading' || !trip.destination}
        onClick={() => runSearch()}
      >{state.status === 'loading' ? 'Ищем…' : state.status === 'idle' ? 'Найти маршруты' : 'Повторить поиск'}</button>
      <button className="travel-secondary" type="button" onClick={onChooseTrip}>Другая поездка</button>
    </div>
  </main>;
}
