import type { FormEvent } from 'react';
import type { CreateTripInput, TripValidationError } from './domain';
import { INTERESTS, TRANSPORT, ToggleGroup, VACATION_TYPES } from './ui';

export function CreateTripScreen({ form, setForm, errors, storageAvailable, onSubmit, onCancel }: {
  form: CreateTripInput;
  setForm: (next: CreateTripInput) => void;
  errors: TripValidationError[];
  storageAvailable: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const fieldError = (field: TripValidationError['field']) => errors.find((error) => error.field === field)?.message;

  return <main className="travel-page travel-create">
    <div className="travel-title-row"><div><p className="travel-kicker">НОВАЯ ПОЕЗДКА</p><h1>Создать поездку</h1><p>Сохраните основные параметры. Поиск вариантов и AI-планирование пока не запускаются.</p></div></div>
    {!storageAvailable ? <div className="travel-alert" role="alert">Локальное хранилище недоступно. Поездку нельзя надёжно сохранить на этом устройстве.</div> : null}
    <form className="travel-form" onSubmit={onSubmit} noValidate>
      <section className="travel-form-section">
        <div className="travel-form-section__heading"><span>01</span><div><h2>Основное</h2><p>Откуда начинается поездка и куда вы хотите отправиться.</p></div></div>
        <div className="travel-form-grid">
          <label><span>Откуда</span><input value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value })} placeholder="Например, Казань" autoComplete="address-level2" aria-invalid={Boolean(fieldError('origin'))} />{fieldError('origin') ? <small className="travel-field-error">{fieldError('origin')}</small> : null}</label>
          <label><span>Куда</span><input value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} disabled={form.destinationUnknown} placeholder="Страна или город" aria-invalid={Boolean(fieldError('destination'))} />{fieldError('destination') ? <small className="travel-field-error">{fieldError('destination')}</small> : null}</label>
        </div>
        <label className="travel-check"><input type="checkbox" checked={form.destinationUnknown} onChange={(event) => setForm({ ...form, destinationUnknown: event.target.checked, destination: event.target.checked ? '' : form.destination })} /><span><strong>Не знаю куда</strong><small>Направление можно будет подобрать после подключения ARVELIS AI.</small></span></label>
      </section>

      <section className="travel-form-section">
        <div className="travel-form-section__heading"><span>02</span><div><h2>Даты и путешественники</h2><p>Точные даты или гибкая длительность.</p></div></div>
        <label className="travel-check"><input type="checkbox" checked={form.flexibleDates} onChange={(event) => setForm({ ...form, flexibleDates: event.target.checked })} /><span><strong>Гибкие даты</strong><small>Можно сохранить поездку без точного календарного диапазона.</small></span></label>
        <div className="travel-form-grid travel-form-grid--three">
          <label><span>Начало</span><input type="date" value={form.startDate} disabled={form.flexibleDates} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
          <label><span>Окончание</span><input type="date" value={form.endDate} disabled={form.flexibleDates} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
          <label><span>Количество дней</span><input type="number" min="1" max="90" inputMode="numeric" value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: Number(event.target.value) })} aria-invalid={Boolean(fieldError('durationDays'))} /></label>
          <label><span>Путешественников</span><input type="number" min="1" max="20" inputMode="numeric" value={form.travelerCount} onChange={(event) => setForm({ ...form, travelerCount: Number(event.target.value) })} aria-invalid={Boolean(fieldError('travelerCount'))} /></label>
        </div>
        {fieldError('dates') ? <p className="travel-field-error">{fieldError('dates')}</p> : null}
      </section>

      <section className="travel-form-section">
        <div className="travel-form-section__heading"><span>03</span><div><h2>Бюджет</h2><p>Только ваш лимит — автоматические цены сейчас не рассчитываются.</p></div></div>
        <div className="travel-form-grid travel-form-grid--budget"><label><span>Общий бюджет, ₽</span><input type="number" min="1" step="1000" inputMode="numeric" value={form.budgetLimitRub} onChange={(event) => setForm({ ...form, budgetLimitRub: Number(event.target.value) })} aria-invalid={Boolean(fieldError('budgetLimitRub'))} />{fieldError('budgetLimitRub') ? <small className="travel-field-error">{fieldError('budgetLimitRub')}</small> : null}</label></div>
      </section>

      <section className="travel-form-section">
        <div className="travel-form-section__heading"><span>04</span><div><h2>Предпочтения</h2><p>Помогут будущему ассистенту учитывать ваш стиль путешествия.</p></div></div>
        <div className="travel-field-block"><span>Тип отдыха</span><ToggleGroup values={VACATION_TYPES} selected={form.vacationTypes} onChange={(vacationTypes) => setForm({ ...form, vacationTypes })} /></div>
        <div className="travel-field-block"><span>Интересы</span><ToggleGroup values={INTERESTS} selected={form.interests} onChange={(interests) => setForm({ ...form, interests })} /></div>
        <div className="travel-field-block"><span>Транспорт</span><ToggleGroup values={TRANSPORT} selected={form.transportPreferences} onChange={(transportPreferences) => setForm({ ...form, transportPreferences })} /></div>
        <label><span>Дополнительные пожелания</span><textarea rows={4} value={form.additionalNotes} onChange={(event) => setForm({ ...form, additionalNotes: event.target.value })} placeholder="Например: не хотим сложных пересадок" /></label>
      </section>

      <div className="travel-form-actions"><button className="travel-secondary" type="button" onClick={onCancel}>Отмена</button><button className="travel-primary" type="submit" disabled={!storageAvailable}>Сохранить поездку</button></div>
    </form>
  </main>;
}
