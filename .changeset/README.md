# Changesets

Changelog discipline for `packages/*` — Blueprint §12, Sprint 0 Guide §8.

## What this is for

Internal changelog history for the shared packages (`@kf/contracts`, `@kf/tokens`, `@kf/ui`, `@kf/i18n`, `@kf/shared`). When you change one of them in a way another package would notice, add a changeset describing it:

```bash
pnpm exec changeset
```

That writes a markdown file into this directory. It is reviewed with your PR and consumed later by `changeset version`, which rolls the entries into each package's `CHANGELOG.md`.

## What this is NOT for

**Nothing here is published.** Every package in this repository is `private: true`; `access` is `restricted` and no publish step is configured or intended. Changesets is used here purely for internal changelog discipline, not for releasing to a registry.

`apps/api` and `apps/web` are in the `ignore` list — apps are deployed continuously and are not versioned (Blueprint §12).

## Configuration

See `config.json`. `privatePackages.version` is enabled so private packages still get changelog entries; `privatePackages.tag` is disabled so no git tags are created.
