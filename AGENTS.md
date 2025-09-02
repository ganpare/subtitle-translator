# Repository Guidelines

## Project Structure & Module Organization
- `src/app/[locale]`: App Router pages, layout, and UI for each locale. Start edits in `src/app/[locale]/page.tsx` and `SubtitleTranslator.tsx`.
- `src/app/api`: Route handlers (server only). Example: `api/deepl/route.ts` proxies DeepL.
- `src/app/components`, `src/app/hooks`, `src/app/utils`: Reusable UI, hooks, and helpers. Components use PascalCase; hooks start with `use*`; utils use camelCase.
- `src/i18n`: Routing and helpers for `next-intl`.
- `public/`: Static assets. `messages/`: translation message files.
- `scripts/`: Build tooling (`buildWithLang.js`). Output goes to `out/` when statically exported.

## Build, Test, and Development Commands
```bash
yarn            # install deps (Node >= 18.18)
yarn dev        # start Next.js dev server (http://localhost:3000)
yarn build      # production build (SSG in prod)
yarn start      # run built app
yarn build:lang en   # static build for a single locale (e.g., en, zh, zh-hant)
yarn lint       # run ESLint (next/core-web-vitals)
yarn outdated   # check dependency updates (ncu)
```

## Coding Style & Naming Conventions
- TypeScript-first; prefer `.tsx` for React components, `.ts` for libs.
- 2-space indentation; keep files small and focused.
- React components: PascalCase (e.g., `BatchStatusPanel.tsx`). Hooks: `useThing.tsx`. Utilities: `fileUtils.ts`.
- Use Tailwind for styling where possible; colocate minimal component styles.
- Run `yarn lint` before pushing; fix warnings where feasible.

## Testing Guidelines
- No formal test runner is configured. For new test suites, prefer Vitest + React Testing Library, colocated as `*.test.ts(x)` beside sources.
- For manual checks: run `yarn dev`, verify uploads, translation behavior, and locale routing; validate API routes (e.g., POST `/api/deepl` with `authKey`).

## Commit & Pull Request Guidelines
- Follow Conventional Commits: `feat:`, `fix:`, `chore(scope):` etc. Keep subject ≤ 72 chars.
- PRs must include: clear description, linked issue(s), screenshots/GIFs for UI, and notes on i18n keys or API changes.
- Ensure `yarn lint` and `yarn build` pass locally; keep PRs focused and incremental.

## Security & Configuration Tips
- Do not commit API keys. Use server-side routes for secrets; never expose keys in client code.
- DeepL usage requires an `authKey` on the server route—avoid passing keys from the browser in production.
- Optional: `TAURI_DEV_HOST` can be set for Tauri dev asset prefixing.
