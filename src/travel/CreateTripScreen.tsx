import { type FormEvent, useState } from 'react';
import { getExactTripDuration, validateCreateTripInput, type CreateTripInput, type TripValidationError } from './domain';
import {
  INTERESTS,
  TRANSPORT,
  ToggleGroup,
  VACATION_TYPES,
  formatDateRange,
  formatDays,
  formatMoney,
  formatNights,
  formatTravelers,
} from './ui';

type Step = 1 | 2 | 3;

const STEP_FIELDS: Record<Step, Array<TripValidationError['field']>> = {
  1: ['origin', 'destination', 'dates', 'durationDays'],
  2: ['travelerCount', 'budgetLimitRub'],
  3: [],
};

function Stepper({ value, min, max, label, display, onChange }: {
  value: number;
  min: number;
  max: number;
  label: string;
  display: string;
  onChange: (value: number) => void;
}) {
  return <div className="travel-stepper" role="group" aria-label={label}>
    <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Уменьшить: ${label}`}>−</button>
    <output aria-live="polite">{display}</output>
    <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Увеличить: ${label}`}>+</button>
  </div>;
}

function CalendarIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 3.5v3M14.5 3.5v3M4 7.5h12M4.5 5.5h11v11h-11z" /></svg>;
}

export function CreateTripScreen({ form, setForm, errors, storageAvailable, onSubmit, onCancel }: {
  form: CreateTripInput;
  setForm: (next: CreateTripInput) => void;
  errors: TripValidationError[];
  storageAvailable: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [stepErrors, setStepErrors] = useState<TripValidationError[]>([]);
  const activeErrors = [...errors, ...stepErrors];
  const fieldError = (field: TripValidationError['field']) => activeErrors.find((error) => error.field === field)?.message;
  const exactDuration = !form.flexibleDates ? getExactTripDuration(form.startDate, form.endDate) : null;
  const budgetText = form.budgetLimitRub > 0 ? formatMoney(form.budgetLimitRub) : '';

  const patch = (next: Partial<CreateTripInput>) => {
    setStepErrors([]);
    setForm({ ...form, ...next });
  };

  const goNext = () => {
    const validation = validateCreateTripInput(form).filter((error) => STEP_FIELDS[step].includes(error.field));
    setStepErrors(validation);
    if (validation.length > 0 || step === 3) return;
    setStep((step + 1) as Step);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  };

  const goBack = () => {
    setStepErrors([]);
    if (step === 1) {
      onCancel();
      return;
    }
    setStep((step - 1) as Step);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step !== 3) {
      event.preventDefault();
      goNext();
      return;
    }
    onSubmit(event);
  };

  return <main className="travel-page travel-create">
    <header className="travel-create__header">
      <div>
        <p className="travel-kicker">ШАГ {step} ИЗ 3</p>
        <h1>Создать поездку</h1>
        <p>{step === 1 ? 'Куда и когда' : step === 2 ? 'Кто едет и какой бюджет' : 'Что важно в путешествии'}</p>
      </div>
      <div className="travel-create__progress" aria-label={`Шаг ${step} из 3`}>
        {[1, 2, 3].map((value) => <span key={value} className={value <= step ? 'is-active' : ''} />)}
      </div>
    </header>

    {!storageAvailable ? <div className="travel-alert" role="alert">Не удаётся сохранить поездку на этом устройстве.</div> : null}

    <form className="travel-form travel-form--wizard" onSubmit={handleSubmit} noValidate>
      {step === 1 ? <section className="travel-form-section travel-form-section--step">
        <div className="travel-form-grid">
          <label>
            <span>Откуда</span>
            <input value={form.origin} onChange={(event) => patch({ origin: event.target.value })} placeholder="Например, Казань" autoComplete="address-level2" aria-invalid={Boolean(fieldError('origin'))} />
            {fieldError('origin') ? <small className="travel-field-error">{fieldError('origin')}</small> : null}
          </label>
          <label>
            <span>Куда</span>
            <input value={form.destination} onChange={(event) => patch({ destination: event.target.value })} disabled={form.destinationUnknown} placeholder="Страна или город" aria-invalid={Boolean(fieldError('destination'))} />
            {fieldError('destination') ? <small className="travel-field-error">{fieldError('destination')}</small> : null}
          </label>
        </div>

        <label className="travel-check">
          <input type="checkbox" checked={form.destinationUnknown} onChange={(event) => patch({ destinationUnknown: event.target.checked, destination: event.target.checked ? '' : form.destination })} />
          <span><strong>Не знаю куда</strong><small>Направление можно выбрать позже.</small></span>
        </label>

        <div className="travel-date-mode" role="group" aria-label="Режим дат">
          <button type="button" className={!form.flexibleDates ? 'is-active' : ''} aria-pressed={!form.flexibleDates} onClick={() => patch({ flexibleDates: false })}>Точные даты</button>
          <button type="button" className={form.flexibleDates ? 'is-active' : ''} aria-pressed={form.flexibleDates} onClick={() => patch({ flexibleDates: true })}>Гибкие даты</button>
        </div>

        {!form.flexibleDates ? <>
          <div className="travel-form-grid travel-date-grid">
            <label>
              <span>Начало</span>
              <div className="travel-date-input"><CalendarIcon /><input type="date" value={form.startDate} max={form.endDate || undefined} onChange={(event) => patch({ startDate: event.target.value })} /></div>
            </label>
            <label>
              <span>Окончание</span>
              <div className="travel-date-input"><CalendarIcon /><input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(event) => patch({ endDate: event.target.value })} /></div>
            </label>
          </div>
          {fieldError('dates') ? <p className="travel-field-error">{fieldError('dates')}</p> : null}
          {exactDuration ? <div className="travel-date-summary" role="status">
            <strong>{formatDateRange(form.startDate, form.endDate)}</strong>
            <span>{formatNights(exactDuration.nights)} · {formatDays(exactDuration.days)}</span>
          </div> : null}
        </> : <div className="travel-flex-duration">
          <span>Длительность</span>
          <Stepper value={form.durationDays} min={1} max={90} label="Длительность поездки" display={formatNights(form.durationDays)} onChange={(durationDays) => patch({ durationDays })} />
          {fieldError('durationDays') ? <small className="travel-field-error">{fieldError('durationDays')}</small> : null}
        </div>}
      </section> : null}

      {step === 2 ? <section className="travel-form-section travel-form-section--step">
        <div className="travel-step-field">
          <span>Путешественники</span>
          <Stepper value={form.travelerCount} min={1} max={20} label="Количество путешественников" display={formatTravelers(form.travelerCount)} onChange={(travelerCount) => patch({ travelerCount })} />
          {fieldError('travelerCount') ? <small className="travel-field-error">{fieldError('travelerCount')}</small> : null}
        </div>

        <label className="travel-budget-field">
          <span>Общий бюджет</span>
          <div className="travel-money-input">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={budgetText}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '');
                patch({ budgetLimitRub: digits ? Number(digits) : 0 });
              }}
              placeholder="120 000"
              aria-invalid={Boolean(fieldError('budgetLimitRub'))}
            />
            <span aria-hidden="true">₽</span>
          </div>
          <small>Общий лимит на поездку.</small>
          {fieldError('budgetLimitRub') ? <small className="travel-field-error">{fieldError('budgetLimitRub')}</small> : null}
        </label>
      </section> : null}

      {step === 3 ? <section className="travel-form-section travel-form-section--step">
        <div className="travel-field-block"><span>Тип отдыха</span><ToggleGroup values={VACATION_TYPES} selected={form.vacationTypes} onChange={(vacationTypes) => patch({ vacationTypes })} /></div>
        <div className="travel-field-block"><span>Интересы</span><ToggleGroup values={INTERESTS} selected={form.interests} onChange={(interests) => patch({ interests })} /></div>
        <div className="travel-field-block"><span>Транспорт</span><ToggleGroup values={TRANSPORT} selected={form.transportPreferences} onChange={(transportPreferences) => patch({ transportPreferences })} /></div>
        <label>
          <span>Дополнительные пожелания</span>
          <textarea rows={3} value={form.additionalNotes} onChange={(event) => patch({ additionalNotes: event.target.value })} placeholder="Например: без сложных пересадок" />
        </label>
      </section> : null}

      <div className="travel-form-actions travel-form-actions--wizard">
        <button className="travel-secondary" type="button" onClick={goBack}>Назад</button>
        {step < 3
          ? <button className="travel-primary" type="submit" disabled={!storageAvailable}>Продолжить</button>
          : <button className="travel-primary" type="submit" disabled={!storageAvailable}>Создать поездку</button>}
      </div>
    </form>
  </main>;
}
