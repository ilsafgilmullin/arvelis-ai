import { BrandLockup } from '../components/Brand';

export function WelcomeScreen({ onDemo, onAuth }: { onDemo: () => void; onAuth: () => void }) {
  return (
    <main className="entry-shell">
      <div className="entry-status"><span>PRODUCT PREVIEW</span><i />AI и backend пока не подключены</div>
      <section className="welcome-layout">
        <div className="welcome-brand"><BrandLockup /></div>
        <div className="welcome-copy">
          <p className="section-kicker">ARVELIS AI · ПРОФЕССИОНАЛЬНЫЙ ИИ-АССИСТЕНТ</p>
          <h1>Интеллектуальная работа.<br />Структурированный результат.</h1>
          <p>ARVELIS AI проектируется как профессиональная среда для анализа, работы, учёбы и решения сложных повседневных задач. Сейчас доступен проверяемый frontend-preview без подключённой модели.</p>
          <div className="welcome-actions">
            <button className="button button--primary" type="button" onClick={onDemo}>Открыть рабочее пространство</button>
            <button className="button button--secondary" type="button" onClick={onAuth}>Посмотреть экран доступа</button>
          </div>
          <p className="entry-note">Реальный AI-запрос не выполняется. При доступном localStorage preview-состояние хранится только в этом браузере.</p>
        </div>
      </section>
      <section className="principles-strip" aria-label="Принципы ARVELIS AI">
        <div><span>01</span><strong>Анализ</strong><p>Факты, допущения и риски разделяются явно.</p></div>
        <div><span>02</span><strong>Структура</strong><p>Сложная задача приводится к понятной системе действий.</p></div>
        <div><span>03</span><strong>Контроль</strong><p>Критические действия не выполняются без подтверждения.</p></div>
      </section>
    </main>
  );
}
