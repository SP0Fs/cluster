# Traefik

Ingress controller replacing the retired community ingress-nginx.
Migration plan and annotation mapping: [docs/plans/2026-11-20-traefik-migration.md](../../docs/plans/2026-11-20-traefik-migration.md).

## Layout

```
infra/traefik/
├── values.yaml                  # Helm values (chart traefik/traefik, see applications/infra/traefik.yaml)
└── resources/
    ├── mtls.yaml                # TLSOption "mtls" (client-certificate auth)
    ├── secret.yaml              # SealedSecret "spof-ca" (CA cert for mtls)
    ├── middlewares.yaml         # shared middlewares (redirect-https)
    └── nginx-fallback.yaml      # TEMPORARY: pass not-yet-migrated hosts through to ingress-nginx
```

## Exposure

- NodePort `30080` (HTTP) / `30443` (HTTPS) on nodes labelled `ingress=true`, 2 replicas, one per node.
- IngressClass `traefik` (not the default).

## Using it from an Ingress

```yaml
metadata:
  annotations:
    cert-manager.io/cluster-issuer: ca-issuer
    traefik.ingress.kubernetes.io/router.tls.options: traefik_mtls@kubernetescrd   # require client cert
    traefik.ingress.kubernetes.io/router.middlewares: traefik_redirect-https@kubernetescrd
spec:
  ingressClassName: traefik
```

## Debugging

```sh
kubectl -n traefik logs deploy/traefik
```
