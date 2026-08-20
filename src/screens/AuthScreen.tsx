import { FormEvent, useState } from 'react';
import { BrandLockup } from '../components/Brand';

export function AuthScreen({
  initialName,
  onBack,
  onContinue,
}: {
  initialName: string;
  onBack: () => void;
  onContinue: (name: string) => void;
}) {
  const [name, setName] = useState(initialName === 'Пользователь ARVELIS' ? '' : initialName);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onContinue(name.trim() || 'Пользователь ARVELIS');
  };

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <button className="text-button" type="button" onClick={onBack}>← Назад</button>
        <BrandLockup compact />
        <div className="auth-heading">
          <p className="section-kicker">PREVIEW ACCESS</p>
          <h1>Давайте познакомимся.</h1>
          <p>Скажите, как к вам обращаться. ARVELIS AI использует это имя в приветствии и сохранит его только в локальном preview этого браузера.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Как к вам обращаться
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например: Ильсаф"
              maxLength={80}
              autoComplete="nickname"
            />
          </label>
          <button className="button button--primary" type="submit">Продолжить в ARVELIS AI</button>
        </form>
        <p className="demo-safety-note">В этом preview мы не просим email, пароль, токены или другие секреты.</p>
        <p className="auth-footnote">Настоящая авторизация пока не подключена.</p>
      </section>
    </main>
  );
}
