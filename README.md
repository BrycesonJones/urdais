# Urdais

[![CI](https://github.com/BrycesonJones/urdais/actions/workflows/ci.yml/badge.svg)](https://github.com/BrycesonJones/urdais/actions/workflows/ci.yml)

**Intelligence for the Information Age.**

Urdais is an information and market-data platform for the Information Age: standardized data, historical time series, market intelligence, and proprietary indices covering AI compute, GPU pricing, token economics, memory, photonics, energy, crypto, and related areas.

This repository contains the Urdais web frontend. Product and architecture context lives in [`docs/FRONTEND_PRD.md`](docs/FRONTEND_PRD.md) and [`docs/BACKEND_PRD.md`](docs/BACKEND_PRD.md).

## Documentation

Public documentation starts at `/docs`; `/docs/methodology` renders the canonical
[`docs/methodology.md`](docs/methodology.md) directly. Methodology decisions precede
data schemas and backend implementation, one output at a time.

To publish a page, add a Markdown file under `docs/` and register its file, slug,
section, title, and description in `src/lib/docs/catalog.ts`. The optional catch-all
route supports nested slugs. The catalog controls static generation, sidebar order,
and previous/next links; empty sections are hidden and unknown routes return 404.
Only registered files are public; repository PRDs are not exposed automatically.

Markdown is read on the server and rendered with `react-markdown` at build time.
`unified`, `remark-parse`, `mdast-util-to-string`, and `github-slugger` derive heading
anchors and the on-page contents from Markdown syntax, including inline formatting.
Raw HTML is disabled. Use one H1, H2 sections, and H3 subsections; links to other
public docs should use `/docs/...` URLs. Content changes require a new build/deploy.
No MDX execution, custom page components, or docs hosting service is required.

Docs search is deferred: the existing search is specific to markets and indices.
The page catalog and Markdown sources provide an entry point for future indexing.

## Stack

- [Next.js](https://nextjs.org/) (App Router) with React Server Components
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/) (strict)
- [Tailwind CSS](https://tailwindcss.com/) v4 via PostCSS, plus ordinary CSS in `src/app/globals.css`
- ESLint (`eslint-config-next`)
- npm as the package manager

## Prerequisites

- Node.js 22 or newer (Node 24 LTS recommended; see `.nvmrc`)
- npm 10 or newer
- For database work only: PostgreSQL client and server binaries (`psql`, `initdb`, `pg_ctl`; PostgreSQL 16 or 17). Docker is not required. The [Supabase CLI](https://supabase.com/docs/guides/cli) is needed only to link the hosted development project or generate types.

## Getting started

```bash
npm install
cp .env.example .env.local   # optional for now; no variables are required yet
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev        # start the development server
npm run build      # create a production build
npm run start      # serve the production build
npm run lint       # run ESLint
npm run typecheck  # generate Next.js route types and run tsc --noEmit
npm test           # run Vitest

# Database foundation (see docs/architecture/ucpi-h100-backend-foundation.md)
npm run db:start   # start a throwaway local PostgreSQL cluster under .local/pg (port 54329)
npm run db:reset   # drop and recreate the working database
npm run db:migrate # apply supabase/migrations/*.sql in order
npm run db:test    # run supabase/tests/*.sql (each test rolls itself back)
npm run db:replay  # reset -> migrate -> test, twice, proving a deterministic bootstrap
npm run db:stop    # stop the local cluster
```

Migrations under `supabase/migrations/` are the single source of truth for the database. They are applied to the hosted development project (`UrdaisDev`) only after passing `db:replay`, and never edited afterwards; a correction is a new migration. Pull-request CI runs the same replay against PostgreSQL 17 and never connects to the hosted project.

## Environment variables

Environment variables are documented in [`.env.example`](.env.example). Copy it to `.env.local` for local development. Real environment files (`.env`, `.env.local`, `.env.*.local`) are git-ignored and must never be committed.

- `NEXT_PUBLIC_*` variables are exposed to the browser. Never put secrets behind this prefix.
- Server-only secrets use unprefixed names and are read only in server code.
- Public values are parsed in `src/config/env.ts`.

## Directory structure

```text
urdais/
├── docs/                 # public Markdown docs and product / architecture context
│   ├── methodology/      # routed methodology pages (registered in src/lib/docs/catalog.ts)
│   ├── research/         # internal research artifacts; never routed
│   └── architecture/     # internal architecture documents; never routed
├── scripts/db/           # local-first database harness, platform-role bootstrap, schema fingerprint
├── supabase/
│   ├── config.toml       # Supabase CLI project config (no credentials)
│   ├── migrations/       # canonical database schema, applied in filename order
│   └── tests/            # SQL database tests, one transaction each, rolled back
├── public/               # static assets served from /
├── src/
│   ├── app/              # Next.js routes, layouts, metadata, globals.css
│   ├── components/
│   │   ├── ui/           # low-level visual primitives
│   │   ├── layout/       # app shell: navigation, headers, page containers
│   │   └── shared/       # reusable, domain-independent components
│   ├── features/         # product/domain functionality, organized by feature
│   ├── lib/              # framework-independent utilities, clients, formatters
│   ├── hooks/            # reusable React hooks
│   ├── types/            # shared TypeScript types
│   ├── constants/        # static constants
│   └── config/           # app-level configuration and environment parsing
├── .env.example
├── eslint.config.mjs
├── next.config.ts
├── postcss.config.mjs
└── tsconfig.json
```

The `@/*` path alias maps to `src/*`. Directories that are still empty are not checked in; create them when the first file needs them.

`AGENTS.md` is generated and maintained by `next dev` and is committed so the working tree stays clean.

## Workflow

Work happens on feature branches merged through reviewed pull requests. Do not push directly to `main`.

Every pull request and every push to `main` is validated by GitHub Actions (`.github/workflows/ci.yml`) in two independent jobs.

The `validate` job runs `npm ci` followed by:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

The `database` job starts a PostgreSQL 17 service container, bootstraps the Supabase platform roles, applies every migration from zero, runs the SQL tests, and repeats the whole cycle once more to prove the bootstrap is deterministic. It needs no hosted project and no secrets.

CI uses the Node version from `.nvmrc`. Run the four `validate` commands and `npm run db:replay` locally before opening a PR.
