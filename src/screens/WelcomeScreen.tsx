import { BrandLockup } from '../components/Brand';

export function WelcomeScreen({ onDemo, onAuth }: { onDemo: () => void; onAuth: () => void }) {
  return (
    <main className="entry-shell">
      <div className="entry-status"><span>PRODUCT PREVIEW</span><i />AI и backend пока не подключены</div>
      <section className="welcome-layout">
        <div className="welcome-brand"><BrandLockup /></div>
        <div className="welcome-copy">
          <p className="section-kicker">ПРОФЕССИОНАЛЬНЫЙ ИИ-АССИСТЕНТ</p>
          <h1>Добро пожаловать<br />в ARVELIS AI.</h1>
          <p>Спокойное и понятное пространство для сложных задач, учёбы, анализа и решений. Мы сохраняем профессиональную точность, но делаем работу с интеллектом естественной и удобной.</p>
          <div className="welcome-actions">
            <button className="button button--primary" type="button" onClick={onDemo}>Открыть ARVELIS AI</button>
            <button className="button button--secondary" type="button" onClick={onAuth}>Продолжить с именем</button>
          </div>
          <p className="entry-note">Сейчас это frontend-preview: реальный AI-запрос не выполняется, а локальные данные остаются только в этом браузере.</p>
        </div>
      </section>
      <section className="principles-strip" aria-label="Принципы ARVELIS AI">
        <div><span>01</span><strong>Понимание</strong><p>Начинаем с цели и контекста, а не с лишней сложности.</p></div>
        <div><span>02</span><strong>Структура</strong><p>Превращаем сложную задачу в понятную систему действий.</p></div>
        <div><span>03</span><strong>Контроль</strong><p>Важные действия остаются прозрачными и управляемыми.</p></div>
      </section>
    </main>
  );
}
