# Contributing

## Commit messages

This repo follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

### Rules

- Subject line: imperative mood, lowercase, no trailing period, max ~72 characters
- Body (optional): separated from subject by a blank line; explain _why_, not _what_

### Types

| Type | Purpose |
|---|---|
| `feat` | New functionality |
| `fix` | Bug fix |
| `refactor` | Code restructuring with no behaviour change |
| `style` | Formatting, whitespace, cosmetic changes (no logic change) |
| `docs` | Documentation only |
| `chore` | Maintenance — dependency updates, cleanup, tooling |

### Scopes

| Category | Examples |
|---|---|
| Resource | `deployment`, `ingress`, `service`, `secret`, `pvc` |
| Config | `docker`, `ci`, `argocd` |
| General | `matrix`, `nanobot` |

Scope is optional when a commit spans many unrelated areas, but prefer including one.

### Examples

```
feat(deployment): add health probes and PVC mount
fix(ingress): correct gateway port to 18790
chore(docker): bump nanobot version to v0.1.5
docs(agents): update config template with matrix settings
refactor(ci): split docker build into multi-stage
```

### Breaking changes

Prefix the body with `BREAKING CHANGE:` or append `!` after the type/scope.

## Branch naming

Pattern: `<type>/<short-description>`

- `<type>` — one of the commit types above
- `<short-description>` — lowercase, hyphen-separated, 2-4 words

Examples: `feat/matrix-channel`, `fix/pvc-mount-order`, `chore/bump-nanobot`

## Branch lifecycle

1. Never commit directly to `master` — always use a feature branch off `master`
2. Make focused, atomic commits (each should represent one logical change)
3. Merge (or fast-forward) into `master`
4. Delete the branch after merging

## Documentation standards

- **Voice**: Direct, concise, technical
- Always specify language in code blocks
- Documentation locations:
  - `AGENTS.md` — AI agent coordination, quick reference
  - `ARCHITECTURE.md` — System architecture, component diagrams, data flow
  - `DESIGN.md` — Design decisions and rationale
  - `CONTRIBUTING.md` — This file; conventions and guidelines
  - `TODO.md` — Open tasks and technical debt

## YAML style

- 2-space indentation
- Use `---` document separator only when multiple documents share a file
- Quote strings only when necessary (colons, special characters)
- Prefer explicit `namespace` in all resource metadata (do not rely on ArgoCD defaulting)
- Labels: always include `app: nanobot` on deployments and services

## Secrets

Never commit plaintext secrets. Always use SealedSecrets. See `AGENTS.md` for the sealing workflow.
