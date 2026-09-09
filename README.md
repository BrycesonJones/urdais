# Urdais

**Intelligence for the Information Age.**

Urdais is an information and market-data platform for the Information Age: standardized data, historical time series, market intelligence, and proprietary indices covering AI compute, GPU pricing, token economics, memory, photonics, energy, crypto, and related areas.

This repository contains the Urdais web frontend. Product and architecture context lives in [`docs/FRONTEND_PRD.md`](docs/FRONTEND_PRD.md) and [`docs/BACKEND_PRD.md`](docs/BACKEND_PRD.md).

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
```

## Environment variables

Environment variables are documented in [`.env.example`](.env.example). Copy it to `.env.local` for local development. Real environment files (`.env`, `.env.local`, `.env.*.local`) are git-ignored and must never be committed.

- `NEXT_PUBLIC_*` variables are exposed to the browser. Never put secrets behind this prefix.
- Server-only secrets use unprefixed names and are read only in server code.
- Public values are parsed in `src/config/env.ts`.

## Directory structure

```text
urdais/
├── docs/                 # product / architecture context (PRDs)
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
