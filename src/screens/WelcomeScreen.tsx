import { BrandLockup } from '../components/Brand';

export function WelcomeScreen({ onDemo, onAuth }: { onDemo: () => void; onAuth: () => void }) {
  return (
    <main className="entry-shell">
      <div className="entry-status"><span>PRODUCT PREVIEW</span><i />AI/backend пока не подключены</div>
      <section className="welcome-layout">
        <div className="welcome-brand"><BrandLockup /></div>
        <div className="welcome-copy">
          <p className="section-kicker">ПРОФЕССИОНАЛЬНЫЙ ИИ-АССИСТЕНТ</p>
          <h1>Сложная задача.<br />Точный результат.</h1>
          <p>ARVELIS AI создаётся как единое рабочее пространство для анализа, учёбы, планирования и повседневных решений.</p>
          <div className="welcome-actions">
            <button className="button button--primary" type="button" onClick={onDemo}>Открыть рабочее пространство</button>
            <button className="button button--secondary" type="button" onClick={onAuth}>Посмотреть вход</button>
          </div>
          <p className="entry-note">Текущая версия — frontend preview. Данные сохраняются только локально в браузере.</p>
        </div>
      </section>
      <section className="principles-strip" aria-label="Принципы ARVELIS AI">
        <div><span>01</span><strong>Точность</strong><p>Факты отдельно от предположений.</p></div>
        <div><span>02</span><strong>Структура</strong><p>Сложное превращается в понятный план.</p></div>
        <div><span>03</span><strong>Контроль</strong><p>Рискованные действия требуют подтверждения.</p></div>
      </section>
    </main>
  );
}
