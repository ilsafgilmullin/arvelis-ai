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
  const [email, setEmail] = useState('');

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
          <p className="section-kicker">DEMO AUTH</p>
          <h1>Вход в ARVELIS AI</h1>
          <p>Авторизация пока не подключена. Форма нужна для проверки UX и сохраняет только имя в локальном demo-состоянии.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Имя
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Как к вам обращаться" maxLength={80} />
          </label>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="name@example.com" autoComplete="email" required />
          </label>
          <label>
            Пароль
            <input type="password" placeholder="Не менее 8 символов" minLength={8} autoComplete="current-password" required />
          </label>
          <button className="button button--primary" type="submit">Продолжить в демо</button>
        </form>
        <p className="auth-footnote">Никакая учётная запись при этом не создаётся.</p>
      </section>
    </main>
  );
}
