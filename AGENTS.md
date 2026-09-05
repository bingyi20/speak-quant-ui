# Trade Lab UI working conventions

- Run with Node 22 / pnpm 10. `pnpm dev` serves http://127.0.0.1:6002.
- `docs/Trade Lab 前端整体架构方案.md` defines the architecture. `docs/接口定义文档.md` defines actual backend contracts.
- Keep `prototype/` and reference projects independent; never copy their demo data into production feature logic.
- Routes and layouts compose features. Components must not call fetch or embed endpoint paths.
- Put module API functions and types in `app/features/<module>/`; use `app/lib/http` for JSON, SSE and downloads.
- Token state is instance-local to the HTTP auth session. Never persist or serialize tokens into Pinia, localStorage, logs or SSR HTML.
- Default scaffold mode works without a backend; placeholder UI must not pretend to create real research, authenticate or process payments.
- No API proxy/BFF. Local API is 6001 with backend CORS, frontend is 6002; production uses /api.
- Public SSR landing is `/`; client workspaces are `/new-task` and `/conversations/:id`. Account settings are global overlays.
- Feature code uses explicit imports. Shared libraries cannot import features or stores.
- Use semantic CSS variables and localized interface strings. Dark theme is gated until design approval.
- Run `pnpm lint`, `pnpm typecheck`, and relevant tests for implementation changes. For routing/layout changes run `pnpm test:e2e`.
- Run `pnpm build` for framework/config changes; stop and restart the dev server around production builds because both write `.nuxt`.
- Keep source formatted with `pnpm format`. Do not format or alter the reference documents unless the task calls for it.
