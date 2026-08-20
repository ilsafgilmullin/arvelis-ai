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
          <p className="section-kicker">DEMO ACCESS</p>
          <h1>Вход в ARVELIS AI</h1>
          <p>Настоящая авторизация пока не подключена. Для UX-проверки достаточно указать только отображаемое имя.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Отображаемое имя
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Как к вам обращаться"
              maxLength={80}
              autoComplete="nickname"
            />
          </label>
          <button className="button button--primary" type="submit">Продолжить в локальный демо</button>
        </form>
        <p className="demo-safety-note">Email, пароль, токены и другие секреты в этой версии не запрашиваются и не нужны.</p>
        <p className="auth-footnote">Учётная запись не создаётся. Имя сохраняется только в localStorage этого браузера.</p>
      </section>
    </main>
  );
}
