# SparkyFitness

Self-hosted nutrition / exercise / health tracker.

## Overview

[SparkyFitness](https://github.com/CodeWithCJ/SparkyFitness) — three components in namespace `sparky-fitness`:

| Component | Image | Port |
|---|---|---|
| `sparkyfitness-frontend` | `codewithcj/sparkyfitness` (nginx, proxies `/api`, `/uploads` to the server) | 80 |
| `sparkyfitness-server` | `codewithcj/sparkyfitness_server` (runs DB migrations on start) | 3010 |
| `sparkyfitness-db` | `postgres:18.3-alpine` (dedicated; the server creates its own `sparky_app` role) | 5432 |

Storage:
- `sparkyfitness-data` — 10Gi NFS (`ssd` class), subPaths `uploads/`, `backup/`
- `sparkyfitness-db` — `local-path` on hp-elitedesk (DB pinned there via nodeSelector)

Secrets: SealedSecret `sparkyfitness-secrets` (DB passwords, API encryption key, `BETTER_AUTH_SECRET`).
`BETTER_AUTH_SECRET` must never change — rotating it logs everyone out and locks out 2FA users.

## mTLS / spof-cert

The ingress uses the shared client CA. `sparky-fitness/spof-cert` is copied out-of-band
(only `ca.crt`, which is all nginx needs):

```bash
kubectl create secret generic spof-cert -n sparky-fitness \
  --from-literal=ca.crt="$(kubectl get secret spof-cert -n homeassistant -o jsonpath='{.data.ca\.crt}' | base64 -d)"
```

## Links

- UI: https://sparky.leibold.tech
- Namespace: `sparky-fitness`
