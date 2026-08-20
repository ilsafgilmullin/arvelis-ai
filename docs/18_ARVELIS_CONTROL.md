# ARVELIS CONTROL — owner/admin control plane

Статус: architecture handoff / implementation starts in separate branch.
Дата: 2026-08-21.

## Уже утверждено пользователем

ARVELIS CONTROL — отдельный административный сайт/центр управления ARVELIS AI для владельца и будущих администраторов.

Его назначение:

- видеть процессы и состояние продукта;
- получать единый обзор проблем;
- получать обращения в техническую поддержку;
- работать с такими обращениями из одного центра;
- со временем дать владельцу полный операционный контроль над проектом.

ARVELIS CONTROL **не является** пунктом пользовательской навигации ARVELIS AI и не должен быть доступен как обычная функция клиента.

## Архитектурное решение v1

CONTROL разрабатывается как отдельная frontend entry-point в том же репозитории, а не как экран внутри `App.tsx` пользовательского приложения.

Это позволяет:

- иметь отдельный URL и отдельный bundle;
- позже вынести CONTROL на отдельный домен/поддомен без переписывания интерфейса;
- использовать отдельную owner/admin session model;
- не делить browser localStorage/session с пользовательским приложением;
- не смешивать public UX и внутренние operational tools.

## Первый frontend-preview scope

Можно реализовать до backend:

1. **Обзор** — статус модулей и продукта без фальшивых live-метрик.
2. **Поддержка** — inbox-layout и empty/offline/error states; реальные письма/тикеты пока не подключены.
3. **Проблемы** — operational incident/work queue foundation без выдуманных production incidents.
4. **Процессы** — фактический статус модулей: frontend preview / auth not connected / AI not connected / backend not connected.
5. **События** — audit/activity shell; реальный audit backend пока отсутствует.
6. **Настройки CONTROL** — только безопасные frontend preferences; production secrets сюда не помещаются.

Все mock/demo элементы должны быть явно маркированы.

## Security requirements до production

- отдельная owner/admin авторизация;
- серверная проверка ролей и permissions;
- принцип least privilege;
- MFA/passkey/step-up authentication — отдельное решение перед production;
- серверный audit log для административных действий;
- session revoke/device management;
- rate limiting и защита от credential stuffing;
- никаких API keys/session secrets в frontend;
- CONTROL frontend не получает прямые DB credentials;
- support content и пользовательские данные должны иметь минимально необходимые права доступа;
- production actions должны иметь confirm/audit/rollback policy.

## OPEN — не считать утверждёнными

- точный домен CONTROL;
- перечень admin/owner/moderator ролей;
- способ owner login;
- support provider/email/helpdesk integration;
- user management actions;
- billing/refund tools;
- AI-provider/model controls;
- production infrastructure controls;
- какие действия требуют second factor / second approval;
- retention и доступ к пользовательским данным.

## UX direction

CONTROL сохраняет бренд ARVELIS, но визуально отличается от пользовательского приложения:

- более плотная operational layout;
- строгий graphite/gold;
- никаких decorative cosmic/HUD элементов;
- desktop-first для сложного управления, но usable на iPhone;
- ясные system states;
- опасные действия визуально и семантически отделены.
