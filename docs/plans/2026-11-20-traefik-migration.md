# Migrate from ingress-nginx to Traefik

**Why:** the community `kubernetes/ingress-nginx` controller was retired (no releases or
security fixes after March 2026). It is the only internet-facing component and enforces
mTLS for most apps. We run chart 4.12.1, which is older than the final release.

**Target:** Traefik v3 (chart `traefik/traefik` 42.4.1), plain `networking.k8s.io/v1`
Ingresses with `ingressClassName: traefik`, plus a few shared Traefik CRDs in the
`traefik` namespace. Gateway API can follow later on the same controller.

## Design: Traefik in front, nginx behind it during the migration

```
router :80/:443 ──► Traefik NodePort 30080/30443
                      ├─ host already migrated  → Traefik terminates TLS (+ mTLS) → app
                      └─ host not migrated yet  → SNI passthrough / HTTP catch-all → ingress-nginx (unchanged)
```

- Traefik runs next to nginx on new NodePorts, so nothing changes until the router is switched.
- `infra/traefik/resources/nginx-fallback.yaml` passes every not-yet-migrated host
  through to nginx, which still terminates TLS and checks the client certificate as today.
- Migrating an app = one commit: change its Ingress and remove its host from the passthrough list.
  No downtime, and rollback means reverting that commit.
- Rolling back the whole thing means pointing the router back at nginx's NodePorts (32366/30197).

Shared building blocks (namespace `traefik`):

| Resource | Replaces | Reference from an Ingress |
|---|---|---|
| `TLSOption mtls` + `SealedSecret spof-ca` (CA cert only) | `auth-tls-verify-client`, `auth-tls-secret`, `auth-tls-verify-depth` | `traefik.ingress.kubernetes.io/router.tls.options: traefik_mtls@kubernetescrd` |
| `Middleware web-defaults` (chain: `redirect-https` + `security-headers`: HSTS, nosniff, referrer policy) | nginx's default ssl-redirect | `traefik.ingress.kubernetes.io/router.middlewares: traefik_web-defaults@kubernetescrd` |
| `TLSOption default` (TLS ≥ 1.2, `sniStrict`) | nginx's TLS defaults | applies automatically to TLS routers without `router.tls.options` |

## Phases

### Phase 1: deploy Traefik (nothing changes for users)
Files: `applications/infra/traefik.yaml`, `infra/traefik/`.

Checks after the ArgoCD sync:
```sh
kubectl -n traefik get pods -o wide            # 2 pods, one on each ingress=true node
kubectl get ingressclass                       # nginx + traefik, neither the default
# Passthrough to nginx works through Traefik (client cert still needed):
curl -sv --resolve home.leibold.tech:30443:192.168.178.99 https://home.leibold.tech:30443/ \
  --cert client.crt --key client.key -o /dev/null
curl -sv --resolve home.leibold.tech:30080:192.168.178.99 http://home.leibold.tech:30080/ -o /dev/null  # 308 → https
```

### Phase 2: switch the front door (user, on the router)
1. Change port forwarding on the router: 80 → `<node>:30080`, 443 → `<node>:30443`.
2. **In the same step**, switch cert-manager's HTTP-01 solver to Traefik
   (`infra/cert-manager/resources/issuer.yaml`, both issuers):
   ```yaml
   http01:
     ingress:
       ingressClassName: traefik   # was: class: nginx
   ```
   Why: once a host is on Traefik, its HTTP router redirects `/.well-known/acme-challenge/*`
   to HTTPS, so an nginx-class solver can't answer for it anymore. Traefik-class solver
   Ingresses have a longer rule, so they win over the app routers for every host.
   They are served on :80 before the catch-all to nginx.
3. Check that all sites still work. Optionally force a renewal on one cert
   (`cmctl renew -n zigbee2mqtt z2m-certs`) to prove ACME works.

### Phase 3: migrate one app per commit
Suggested order, lowest risk first:
1. `matrix` (no mTLS: checks basic routing and cert reuse)
2. `esphome`, `zigbee2mqtt`, `openthread`, `pihole` (plain mTLS)
3. `beszel` (Helm values, no mTLS), `sealed-secrets-web` (Helm values + mTLS)
4. `sparky-fitness` (timeouts / body size)
5. `your-spotify` (path rewrite)
6. `homeassistant` (long-lived websockets; Ingress change only, the HA pod is not restarted)
7. `argocd` (HTTPS backend; do this last, it's how we fix things if something breaks)

Per app:
- `ingressClassName: nginx` → `traefik` (Helm charts: `className` / `ingressClassName` value)
- drop every `nginx.ingress.kubernetes.io/*` annotation, then add as needed:

| nginx annotation | Traefik equivalent |
|---|---|
| `auth-tls-*` (verify-client, secret, depth) | `router.tls.options: traefik_mtls@kubernetescrd` |
| `auth-tls-error-page` | none: the handshake fails before HTTP, so no redirect is possible (the browser shows a TLS error) |
| `auth-tls-pass-certificate-to-upstream` | `PassTLSClientCert` middleware, only if an app actually reads the cert (none known) |
| `backend-protocol: HTTP` | default, drop it |
| `backend-protocol: HTTPS` (argocd) | Service annotation `traefik.ingress.kubernetes.io/service.serversscheme: https` + a `ServersTransport` with `insecureSkipVerify`, **or** `server.insecure: true` in argo-cd values (simpler) |
| `proxy-body-size` | none needed (Traefik doesn't limit body size by default) |
| `proxy-read-timeout` / `proxy-send-timeout` | none needed for responses (no default backend timeout); request reads limited by entrypoint `readTimeout: 600s` |
| `rewrite-target: /$2` + `use-regex` (your-spotify `/api`) | `stripPrefix` Middleware `/api` in the app namespace, path `/api` with `pathType: Prefix` |
| `force-ssl-redirect`, `ssl-passthrough` (argocd) | `web-defaults` middleware; passthrough was never active (it needs the controller flag `--enable-ssl-passthrough`) |

Ingress template:
```yaml
metadata:
  annotations:
    cert-manager.io/cluster-issuer: ca-issuer
    traefik.ingress.kubernetes.io/router.tls.options: traefik_mtls@kubernetescrd   # mTLS apps only
    traefik.ingress.kubernetes.io/router.middlewares: traefik_web-defaults@kubernetescrd
spec:
  ingressClassName: traefik
```
Then delete the host's `HostSNI` route from `infra/traefik/resources/nginx-fallback.yaml`
in the same commit. The existing `*-certs` TLS secrets are reused as they are.

Test: browser with client cert works; `curl` without a cert fails the handshake;
`curl http://…` → 308 to https.

### Phase 4: remove ingress-nginx
- Delete `applications/infra/ingress-nginx.yaml`, `infra/ingress-nginx/`,
  `infra/traefik/resources/nginx-fallback.yaml`.
- Optionally move Traefik to nginx's old NodePorts. The router already points at 30080/30443, so this isn't needed.
- The per-namespace `spof-cert` copies were only needed for nginx's `auth-tls-secret`. Delete them once nothing references them (they contain the CA **private key**, see below).
- Update README.md / ARCHITECTURE.md / DESIGN.md / CONTRIBUTING.md mentions of nginx.

## Known differences / follow-ups
- **The mTLS CA is the k3s client CA** (`CN=k3s-client-ca@1734203794`), and its private key
  (`ca.key`) is copied into ~11 namespaces as `spof-cert`. Anyone who can read one of those
  secrets can sign a client cert that k3s accepts (e.g. `O=system:masters` → cluster-admin).
  Also, any k3s client cert (kubeconfigs) passes the web mTLS check. Recommended: a
  separate CA just for browser/device certs, issue new client certs, then put only its
  `ca.crt` into the `spof-ca` SealedSecret (`infra/traefik/resources/secret.yaml`).
- Client IP: for hosts still behind nginx, nginx now sees the Traefik pod as the client
  (same SNAT situation as before with NodePort). PROXY protocol could fix this, but it isn't worth it for the transition.
- Old `infra/ingress-nginx/podAntiAffinity` value was never applied (wrong key); both nginx
  pods run on hp-elitedesk. The Traefik values use `affinity`, so pods spread across both nodes.
