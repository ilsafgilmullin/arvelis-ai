export function ServiceFoundation({ kicker, title, text, onPrimary, primaryLabel }: { kicker: string; title: string; text: string; onPrimary: () => void; primaryLabel: string }) {
  return <main className="travel-page"><section className="travel-service-foundation"><p className="travel-kicker">{kicker}</p><h1>{title}</h1><p>{text}</p><div className="travel-service-foundation__visual" aria-hidden="true"><span>A</span><i /><i /><i /></div><button className="travel-primary" type="button" onClick={onPrimary}>{primaryLabel}</button></section></main>;
}

export function SettingsScreen({ onOpenDiagnostics }: { onOpenDiagnostics: () => void }) {
  const groups = [
    ['Общие', [['Язык', 'Русский'], ['Валюта', 'RUB · текущая модель поездок'], ['Единицы', 'Не настроено']]],
    ['Поездки', [['Travel preferences', 'Настраиваются в каждой поездке'], ['Уведомления', 'Не подключены']]],
    ['Конфиденциальность и безопасность', [['Privacy', 'Управление данными будет расширено отдельным этапом'], ['Security', 'Серверная авторизация остаётся в защищённом account-контуре']]],
  ] as const;

  return <main className="travel-page travel-settings"><div className="travel-title-row"><div><p className="travel-kicker">АККАУНТ</p><h1>Настройки</h1><p>Параметры интерфейса и путешествий без демонстрации неработающих переключателей.</p></div></div>{groups.map(([title, rows]) => <section className="travel-settings__group" key={title}><h2>{title}</h2>{rows.map(([label, value]) => <div className="travel-settings__row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>)}{import.meta.env.DEV ? <section className="travel-settings__group travel-settings__advanced"><h2>Advanced / Diagnostics</h2><p>Внутренний экран доступен только в dev-режиме.</p><button className="travel-secondary" type="button" onClick={onOpenDiagnostics}>Открыть диагностику</button></section> : null}</main>;
}

export function HelpScreen() {
  return <main className="travel-page"><div className="travel-title-row"><div><p className="travel-kicker">ПОМОЩЬ</p><h1>Помощь</h1><p>Короткие ориентиры по текущему Travel workspace.</p></div></div><section className="travel-help-grid"><article><h2>Как создать поездку</h2><p>Откройте «Создать поездку», заполните обязательные поля и сохраните. Черновик останется в текущем пользовательском контуре.</p></article><article><h2>Почему AI не отвечает</h2><p>Реальный AI Gateway пока не подключён. ARVELIS специально не подменяет его демонстрационными ответами.</p></article><article><h2>Где документы и карта</h2><p>Интерфейсные разделы готовы, но реальные провайдеры и загрузка документов вынесены в отдельные этапы.</p></article></section><p className="travel-capability-note">Служба поддержки и внешний help center пока не подключены.</p></main>;
}
