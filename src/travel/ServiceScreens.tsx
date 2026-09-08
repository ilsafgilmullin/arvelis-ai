type ServiceIconName = 'route' | 'document' | 'shield' | 'map' | 'budget';

function ServiceIcon({ name }: { name: ServiceIconName }) {
  const paths: Record<ServiceIconName, string[]> = {
    route: ['M4 15.5c2.2-5 4-1 6-6s4-1 6-5', 'M4 15.5h3', 'M4 15.5V13', 'M15 4h2v2'],
    document: ['M6 3.5h6l3 3V17H6z', 'M12 3.5V7h3', 'M8 10h5', 'M8 13h5'],
    shield: ['M10 3.5 15 5v4.5c0 3.2-2 5.8-5 7-3-1.2-5-3.8-5-7V5z', 'm7.5 10 1.5 1.5 3.5-3.5'],
    map: ['M6 4 3.5 5.5v11L6 15l4 1.5 4-1.5 2.5 1.5v-11L14 4l-4 1.5z', 'M6 4v11', 'M10 5.5v11', 'M14 4v11'],
    budget: ['M4 6h12v9H4z', 'M12.5 10.5h3', 'M6.5 8.5h3'],
  };
  return <svg viewBox="0 0 20 20" aria-hidden="true">{paths[name].map((path) => <path key={path} d={path} />)}</svg>;
}

export function ServiceFoundation({ kicker, title, text, icon, onPrimary, primaryLabel }: {
  kicker: string;
  title: string;
  text: string;
  icon: ServiceIconName;
  onPrimary?: () => void;
  primaryLabel?: string;
}) {
  return <main className="travel-page">
    <section className="travel-service-foundation">
      <div className={`travel-service-foundation__icon is-${icon}`}><ServiceIcon name={icon} /></div>
      <p className="travel-kicker">{kicker}</p>
      <h1>{title}</h1>
      <p>{text}</p>
      {onPrimary && primaryLabel ? <button className="travel-primary" type="button" onClick={onPrimary}>{primaryLabel}</button> : null}
    </section>
  </main>;
}

export function SettingsScreen({ onOpenDiagnostics }: { onOpenDiagnostics: () => void }) {
  const diagnosticsEnabled = import.meta.env.DEV && import.meta.env.VITE_SHOW_DIAGNOSTICS === 'true';
  const groups = [
    ['Общие', [['Язык', 'Русский'], ['Валюта', 'Российский рубль'], ['Единицы измерения', 'Метрические']]],
    ['Поездки', [['Настройки поездок', 'Для каждой поездки отдельно'], ['Уведомления', 'Пока недоступны']]],
    ['Данные и защита', [['Конфиденциальность', 'Управление данными'], ['Безопасность', 'Защита аккаунта и сессий']]],
  ] as const;

  return <main className="travel-page travel-settings">
    <div className="travel-title-row"><div><p className="travel-kicker">НАСТРОЙКИ</p><h1>Настройки</h1><p>Основные параметры приложения и путешествий.</p></div></div>
    {groups.map(([title, rows]) => <section className="travel-settings__group" key={title}>
      <h2>{title}</h2>
      {rows.map(([label, value]) => <div className="travel-settings__row" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </section>)}
    {diagnosticsEnabled ? <section className="travel-settings__group travel-settings__advanced">
      <h2>Расширенные настройки</h2>
      <p>Внутренние инструменты разработки.</p>
      <button className="travel-secondary" type="button" onClick={onOpenDiagnostics}>Открыть диагностику</button>
    </section> : null}
  </main>;
}

export function HelpScreen() {
  return <main className="travel-page">
    <div className="travel-title-row"><div><p className="travel-kicker">ПОМОЩЬ</p><h1>Помощь</h1><p>Короткие ответы по основным возможностям ARVELIS AI.</p></div></div>
    <section className="travel-help-grid">
      <article><h2>Как создать поездку</h2><p>Откройте «Создать поездку» и пройдите три коротких шага.</p></article>
      <article><h2>Почему AI не отвечает</h2><p>AI-планирование пока недоступно в этой версии.</p></article>
      <article><h2>Где документы и карта</h2><p>Эти разделы будут наполняться по мере подготовки конкретной поездки.</p></article>
    </section>
  </main>;
}
