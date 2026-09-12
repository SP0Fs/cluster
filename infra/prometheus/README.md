# Grafana

Server monitoring stack: Prometheus + Alertmanager + Grafana + node-exporter
+ kube-state-metrics + cAdvisor, managed by the Prometheus Operator.

## Architecture

- **Namespace:** `monitoring` (shared with Beszel)
- **Prometheus:** Single replica, 15d retention, 20Gi TSDB on `local-path`
- **Grafana:** Single replica, 5Gi persistence (dashboards, datasources, users)
- **node-exporter:** DaemonSet on every node for host-level metrics
  (CPU/RAM/Disk/Network per host)
- **cAdvisor:** Bundled into kubelet, scrapes per-container CPU/RAM/Network
  automatically
- **Alertmanager:** Single replica, 2Gi storage for silences/nflog

Only Grafana is externally exposed at <https://grafana.leibold.tech> behind
the same mTLS client-cert (spof-cert) as every other app in this cluster.

## Files

```
infra/prometheus/
├── README.md
├── values-prometheus.yaml    # overrides for kube-prometheus-stack Helm chart
└── resources/
    ├── ingress-grafana.yaml  # cert-manager + nginx mTLS (raw, chart's
    │                         # template doesn't expose auth-tls-* annotations)
    └── grafana-admin-secret.yaml  # placeholder — overwrite with your
                                    # own admin password hash before sync
```

The chart lives at <https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack>
and is sourced as a Helm chart in `applications/infra/prometheus.yaml`.

## One-time setup

### 1. Bootstrap the Grafana admin Secret

The chart reads admin credentials from a Kubernetes Secret named
`grafana-admin` with key `admin-password`. **Do not commit the password
in plain text.** Bootstrap locally and re-seal:

```bash
# Generate a strong password and bcrypt-hash it (Grafana accepts either
# plain text or bcrypt-hashed; plain text is simpler, bcrypt is more secure).
PASSWORD="$(openssl rand -base64 24)"

# Create a one-shot Secret in monitoring NS
kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-password="$PASSWORD"

# Re-seal and write to infra/prometheus/resources/grafana-admin-secret.yaml
kubeseal --format=yaml < \
  <(kubectl -n monitoring get secret grafana-admin -o yaml) \
  > infra/prometheus/resources/grafana-admin-secret.yaml

# Commit + push. ArgoCD will manage the Secret from then on.
```

Then delete the plain-text Secret from the cluster — ArgoCD will re-create
it from the SealedSecret on next sync.

### 2. DNS — Strato CNAME

In the Strato DNS panel, add a CNAME:

```
grafana.leibold.tech  →  <nginx-ingress LoadBalancer IP>
```

The ingress-nginx service's external IP can be found via:

```bash
kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Note: this is a CNAME, not an A-record, because the ingress-nginx
controller's IP can change if you ever migrate clusters. The existing
apps (`beszel`, `homeassistant`, etc.) are already CNAME'd this way.

### 3. Certificate issuance

cert-manager (`ca-issuer`) will issue the Let's Encrypt server cert
automatically on first sync — same flow as every other Ingress in the
cluster.

## Verification

```bash
# All pods healthy
kubectl -n monitoring get pods -l 'app.kubernetes.io/name in (prometheus,grafana,alertmanager)'

# Targets discovered
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090 &
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets | length'
# expect ~10-20 (kubelet, apiserver, node-exporter per node, kube-state, ...)

# Grafana UI reachable
curl -I https://grafana.leibold.tech/
# expect HTTP/2 200 (mTLS auth happens at TLS handshake, before HTTP)
```

## Dashboard defaults

The chart's `defaultDashboardsEnabled: true` pre-loads:

- Kubernetes / Compute Resources / Cluster
- Kubernetes / Compute Resources / Namespace (Pods)
- Node Exporter / Nodes
- etc.

Import more via Grafana's UI (Dashboards → New → Import, ID `15757`,
`6417`, `315` for popular k8s dashboards).

## Why not just use Beszel?

Beszel monitors **host hardware** (S.M.A.R.T., ZFS, temperature, fan
speed) — Prometheus doesn't see these out of the box. Prometheus
monitors **workload metrics** (per-pod CPU/memory, HTTP request rates,
custom /metrics endpoints) — Beszel doesn't. They complement each other.

## Uninstall

```bash
kubectl -n monitoring delete application prometheus    # via ArgoCD UI/CLI
# or: argocd app delete prometheus -n argo-cd
```

This will delete every CRD the chart created
(`prometheusrules.monitoring.coreos.com`,
`servicemonitors.monitoring.coreos.com`, etc.). Subsequent Helm syncs of
other apps that depended on these CRDs (none currently) would fail.
