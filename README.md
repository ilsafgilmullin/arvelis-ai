# ARVELIS AI

Профессиональный универсальный ИИ-ассистент для работы, учёбы и решения сложных повседневных задач.

Текущий репозиторий содержит product/frontend foundation и изолированные auth foundations. Реальный AI пока не подключён; demo/mock элементы должны оставаться явно маркированными.

## Development

Текущий стабильный frontend-preview:

```bash
npm run dev
```

Real Email OTP auth candidate находится за rollout flag и не должен включаться без test secrets/checks.

Закрытый бесплатный auth-test path:

- SQLite (`AUTH_DB_PROVIDER=sqlite`, `.data/arvelis-auth.sqlite`);
- generic SMTP через отдельный test mailbox;
- same-origin Auth API;
- HttpOnly server session;
- `VITE_REAL_AUTH_ENABLED=false` до фактического E2E smoke.

После настройки protected environment auth runtime запускается командой:

```bash
npm run dev:auth
```

## Safety

- Не помещать `.env`, SQLite data, SMTP password, OTP/session peppers, API keys или другие secrets в GitHub.
- Не использовать локальный SQLite-файл как production database.
- Не выдавать local/demo chat state за реальный AI/backend.
- Merge в `main` и production publish выполняются только после отдельного подтверждения.

См. `docs/07_DECISIONS.md`, `docs/36_AUTH_PERSISTENCE_V1.md`, `docs/37_FREE_YANDEX_MAIL_AUTH_SETUP.md`, `docs/38_FREE_SQLITE_AUTH_DB.md`.
