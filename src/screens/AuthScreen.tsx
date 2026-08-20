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
          <h1>Доступ к рабочему пространству</h1>
          <p>Настоящая авторизация ещё не подключена. Для проверки интерфейса достаточно указать отображаемое имя — реальная учётная запись не создаётся.</p>
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
          <button className="button button--primary" type="submit">Открыть рабочее пространство</button>
        </form>
        <p className="demo-safety-note">Email, пароль, токены и другие секреты в этой версии не запрашиваются и не нужны.</p>
        <p className="auth-footnote">При доступном localStorage имя сохраняется только в этом браузере.</p>
      </section>
    </main>
  );
}
