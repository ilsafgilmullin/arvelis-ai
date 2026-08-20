# ARVELIS AI — pre-merge audit PR #10

Дата: 2026-08-21
Статус: frontend/local preview, без реального AI/backend/auth/database/billing.

## Source of truth

- Repository: `ilsafgilmullin/arvelis-ai`.
- Stable base before merge: `main` at PR #9 merge commit `adea52b373fc21e78b1f8128c46240ff01fe5404`.
- Candidate: `feat/chat-refactor-v2`, PR #10.
- Branch does not lag behind `main` at audit time.
- Replit Agent was not used.

## Audited areas

- repository/default branch/recent commits;
- root structure and Git workflow;
- `package.json`, Node engine and scripts;
- `.replit` runtime configuration;
- GitHub Actions workflow;
- TypeScript strict configuration;
- app entry/boot/preload/lazy-module flow;
- Welcome / preview access / Workspace / Chat / History / Profile / system states;
- mobile navigation, safe-area and Safari visual viewport behavior;
- local workspace persistence and draft persistence;
- destructive actions and focus-trapped dialogs/sheets;
- user-content rendering and preview/mock labeling;
- secret/env hygiene and preview exposure controls.

## Critical issues fixed during the final audit

### 1. Legacy Safari composer scroll forcing

After Chat moved to a bounded `visualViewport` shell, `ChatScreen` still retained an older listener that called `scrollIntoView()` on every visual viewport resize/scroll/orientation event. This could reintroduce Safari jumps and fight the new layout architecture.

Fix:

- removed the legacy viewport listener and forced composer scrolling;
- composer placement is now owned by the bounded shell;
- `IntersectionObserver` now uses the actual message stream as its root, so `isAtEnd` reflects internal Chat scrolling rather than the document viewport.

### 2. Preview reset persistence could be misleading

The old reset path could visually reset in-memory state while ignoring whether clean state was actually written to storage.

Fix:

- reset removes the old workspace key first;
- the caller explicitly persists the clean default state;
- `persistenceAvailable` is set from the real save result;
- a failed write therefore surfaces through the existing storage warning instead of pretending persistence succeeded.

## Security/data findings

- No real API keys, passwords, tokens or server secrets are requested or stored by the preview UI.
- `.gitignore` excludes `.env`, private key/certificate formats, `secrets/` and `credentials/`.
- User message content is rendered through React text nodes; no HTML injection path is used in the audited preview flow.
- Local workspace parsing validates types, IDs, timestamps, limits and total content budget before accepting stored data.
- Draft storage validates keys/values, bounds entry count/size and catches storage errors.
- Destructive thread/history/reset actions require confirmation where data loss is meaningful.
- Mock/preview content remains explicitly labeled and is not presented as a real model response.

## Runtime/product findings

- Critical App Layout, Workspace and Chat modules are preloaded with a timeout and retry path.
- Secondary History/Profile/States modules warm lazily and do not block startup.
- Mobile Chat uses a dedicated bounded visual viewport shell and internal message scrolling.
- Touch-landscape remains inside the mobile contract even when iPhone landscape CSS width exceeds the portrait breakpoint.
- Document scrolling is restored when leaving Chat.
- ErrorBoundary exposes a recovery action without persisting frontend error details.

## Known infrastructure debt — not hidden

### No dependency lockfile

The repository currently has no `package-lock.json`/pnpm/yarn lockfile. Direct dependency versions are exact, but transitive resolution is not fully reproducible. Replit also currently installs with `--no-package-lock`.

A lockfile was not fabricated during this audit because the isolated environment did not have working npm registry access. Generating and committing a real lockfile from a functioning npm environment is mandatory in the next technical-foundation pass before production work.

### GitHub Actions runner does not start workflow steps

The `ARVELIS CI` workflow is syntactically ordinary (Checkout → Node → Install → Typecheck → Build), but current PR runs fail before the first step: job data returns `steps=null` and no job log. Therefore repository TypeScript 6.0.3 `npm run typecheck` and Vite build are not confirmed by GitHub Actions.

This is recorded as an infrastructure gate to repair. It must not be described as a successful build, but it also is not evidence of a code-level TypeScript/Vite failure.

## Merge decision scope

PR #10 is a private frontend-preview merge, not a production release. User has separately authorized merging after the full audit and critical fixes. The known CI/lockfile infrastructure debt is carried forward explicitly and must be resolved before production-grade foundation work.

## Next product sequence — no AI integration yet

After PR #10 is merged, work restarts from the product shell in a fresh branch and proceeds in this order:

1. Authorization/onboarding UX and future auth contract.
2. Home / primary entry scenario.
3. Profile / account / privacy controls.
4. History and cross-screen navigation consistency.
5. Global loading/empty/error/offline/limit states.
6. Production data/access/security decisions.
7. Only after required MVP gates: provider-independent AI integration.
