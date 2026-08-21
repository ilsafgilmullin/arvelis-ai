# ARVELIS AI — Yandex Cloud Postbox auth email setup

Дата: 2026-08-21.
Статус: **provider approved, infrastructure not activated**.

Этот документ фиксирует точную последовательность для test/auth environment. Он не является production deploy approval.

## 1. Yandex Cloud prerequisites

Нужен Yandex Cloud account с активным или trial billing account.

Создавать Postbox resources нужно в отдельной понятной папке проекта ARVELIS. Service account и Postbox sender/address должны находиться в одной folder boundary.

## 2. Service account

Создать отдельный service account только для отправки auth email, например:

`arvelis-postbox-auth`

Назначить минимально необходимую роль:

`postbox.sender`

Не использовать owner/editor права для SMTP runtime.

## 3. SMTP API key

Для service account создать API key с scope:

`yc.postbox.send`

После создания безопасно сохранить:

- API key ID;
- secret part.

Secret нельзя помещать в GitHub, документацию, screenshots, source code или frontend environment.

В ARVELIS mapping такой:

- API key ID → `POSTBOX_API_KEY_ID`;
- secret part → `POSTBOX_API_KEY_SECRET`.

## 4. Sender/address

Создать Postbox sender/address для ARVELIS и пройти требуемую проверку владения доменом/адресом.

Фактический sender после подтверждения записывается только в protected environment:

`POSTBOX_FROM=<verified sender>`

До успешной проверки sender реальную регистрацию включать нельзя.

## 5. SMTP endpoint

ARVELIS использует официальный Yandex Cloud Postbox SMTP endpoint:

`postbox.cloud.yandex.net`

Основной режим:

- port `587`;
- STARTTLS;
- `POSTBOX_SMTP_SECURE=false`.

Допустимый альтернативный режим:

- port `465`;
- SMTPS;
- `POSTBOX_SMTP_SECURE=true`.

ARVELIS SMTP adapter требует TLS `1.2+`.

## 6. Protected environment

Минимальный набор auth secrets/config для test environment:

```text
DATABASE_URL=<protected PostgreSQL connection string>
AUTH_OTP_PEPPER_HEX=<independent 32+ random bytes as hex>
AUTH_SESSION_PEPPER_HEX=<different independent 32+ random bytes as hex>

EMAIL_DELIVERY_PROVIDER=yandex_cloud_postbox
POSTBOX_API_KEY_ID=<protected API key id>
POSTBOX_API_KEY_SECRET=<protected API key secret>
POSTBOX_FROM=<verified sender>
POSTBOX_SMTP_PORT=587
POSTBOX_SMTP_SECURE=false

AUTH_TRUST_PROXY=<environment-specific>
AUTH_COOKIE_SECURE=auto
VITE_REAL_AUTH_ENABLED=false
```

`AUTH_OTP_PEPPER_HEX` и `AUTH_SESSION_PEPPER_HEX` должны быть разными секретами.

## 7. Database gate

Перед включением frontend real-auth:

1. подготовить тестовую PostgreSQL instance;
2. установить `DATABASE_URL` только как secret;
3. выполнить `npm run db:migrate`;
4. выполнить `npm run check:with-db`;
5. не продолжать rollout при migration checksum mismatch или любом failed check.

## 8. Postbox delivery smoke

До подключения реальных пользователей проверить отдельный email flow:

1. auth server стартует без вывода secrets;
2. OTP request создаёт challenge;
3. Postbox принимает письмо;
4. письмо приходит на тестовый mailbox;
5. в логах нет raw OTP, API key secret, session secret или `DATABASE_URL`;
6. повторный challenge заменяет предыдущий active OTP;
7. старый OTP больше не принимается;
8. rate limits работают на server side.

## 9. Real-auth rollout gate

Только после успешной DB + Postbox проверки установить в test/Replit environment:

`VITE_REAL_AUTH_ENABLED=true`

Затем выполнить iPhone E2E:

`Регистрация → email → OTP → Account → HttpOnly Session → refresh restore → logout → login`

Дополнительно проверить:

- неверный OTP;
- истёкший OTP;
- слишком много попыток;
- sign-up существующего email;
- sign-in неизвестного email;
- session revoke;
- общий iPhone/browser с двумя разными ARVELIS Account — локальная history/drafts не должны пересекаться.

## 10. Production остаётся отдельным решением

Этот setup не утверждает:

- production PostgreSQL provider/region;
- production domain;
- финальные персональные данные/retention requirements;
- production cookie/session retention;
- публичный запуск;
- merge PR №21;
- ARVELIS CONTROL auth.

Любое создание оплачиваемых production resources, изменение production secrets и публикация требуют отдельного подтверждения.

## Official references checked 2026-08-21

- Yandex Cloud Postbox quickstart: https://yandex.cloud/ru/docs/postbox/quickstart
- Sending via SMTP: https://yandex.cloud/ru/docs/postbox/operations/send-email
- Pricing: https://yandex.cloud/ru/docs/postbox/pricing
