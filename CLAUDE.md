# Urdais

Before making changes, read the relevant project context:

- `docs/FRONTEND_PRD.md` — frontend product and architecture context
- `docs/BACKEND_PRD.md` — backend/data platform product and architecture context

These PRDs describe the intended Urdais V1 system. They are context documents, not implementation instructions.

## Development Rules

- Implement only the functionality explicitly requested in the current task.
- Urdais is being built iteratively through small, scoped implementation slices.
- Do not implement features solely because they appear in a PRD.
- Do not prematurely introduce infrastructure, abstractions, services, database tables, endpoints, or integrations that are not required by the current slice.
- Preserve compatibility with the long-term architecture described in the PRDs.
- Prefer simple V1 solutions unless measured requirements justify additional complexity.
- For meaningful feature work, use a feature branch and merge through a reviewed pull request.
