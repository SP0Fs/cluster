# Traefik

Ingress controller replacing the retired community ingress-nginx.
Migration plan and annotation mapping: [docs/plans/2026-11-20-traefik-migration.md](../../docs/plans/2026-11-20-traefik-migration.md).

## Layout

```
infra/traefik/
├── values.yaml                  # Helm values (chart traefik/traefik, see applications/infra/traefik.yaml)
└── resources/
    ├── tls-options.yaml         # TLSOptions "default" (TLS>=1.2, sniStrict) + "mtls" (client cert)
    ├── secret.yaml              # SealedSecret "spof-ca" (CA cert for mtls)
    ├── middlewares.yaml         # web-defaults chain: redirect-https + security-headers
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
    traefik.ingress.kubernetes.io/router.middlewares: traefik_web-defaults@kubernetescrd
spec:
  ingressClassName: traefik
```

## Debugging

```sh
kubectl -n traefik logs deploy/traefik
```
