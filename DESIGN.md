# Design Decisions

## Philosophy

1. **GitOps first** - All cluster state lives in Git
2. **Minimal complexity** - Self-hosted where practical
3. **Security by default** - Encrypted secrets, network policies
4. **Single source of truth** - Monorepo for all manifests

## Technology Choices

### Kubernetes Distribution: k3s

**Decision**: k3s over vanilla Kubernetes

**Rationale**:
- Lightweight (~512MB RAM for k3s-server)
- Single binary, easy upgrades
- Built-in Traefik (disabled in favor of ingress-nginx)
- Good ARM support for Raspberry Pi nodes

### GitOps: Argo CD

**Decision**: Argo CD for GitOps

**Rationale**:
- Native Kubernetes operator
- Great UI for visualization
- Supports Helm, Kustomize, raw YAML
- ApplicationSets for批量 management

### Ingress: ingress-nginx

**Decision**: ingress-nginx over Traefik

**Rationale**:
- More mature, wider adoption
- Better annotation support
- Easier troubleshooting
- Better Prometheus metrics

### Load Balancer: MetalLB

**Decision**: MetalLB in L2 mode

**Rationale**:
- No cloud provider needed
- Simple ARP/NDP based
- Works with any switch/router
- No additional configuration

### TLS: cert-manager + Let's Encrypt

**Decision**: cert-manager with ACME (Let's Encrypt)

**Rationale**:
- Automated certificate rotation
- No manual certificate management
- Supports DNS-01 and HTTP-01 challenges
- Integration with ingress-nginx

### Secret Management: Sealed Secrets

**Decision**: Bitnami Sealed Secrets

**Rationale**:
- No external service required
- Controller-based decryption
- Secrets safe to commit to Git
- kubectl compatible

### Databases

**PostgreSQL** chosen for:
- Relational data
- ACID compliance
- Rich ecosystem
- Bitnami Helm chart

**MongoDB** chosen for:
- Flexible schema
- Document storage
- JSON-native
- Used by specific applications

### Storage: NFS Provisioner

**Decision**: NFS Subdir External Provisioner

**Rationale**:
- Shared storage across nodes
- ReadWriteMany PVCs
- Centralized backup
- Simpler than Ceph/Longhorn

### Home Automation Stack

```
Zigbee devices → zigbee2mqtt → Mosquitto (MQTT) → Home Assistant
```

**Rationale**:
- Vendor-agnostic Zigbee
- MQTT for loose coupling
- Home Assistant for UI/automation
- No cloud dependency

## Namespace Organization

### apps/
User-facing applications and services.

### infra/
Cluster infrastructure components (must be deployed first).

### system/
Kubernetes system components.

## Deployment Strategies

### Apps
- Argo CD Application per app
- Automated sync with prune
- Helm charts where available
- Raw YAML for custom deployments

### Infrastructure
- Manual or bootstrap Argo CD Application
- Depends on cluster being up
- May require order (cert-manager before ingress-nginx)

## Naming Conventions

- **Namespaces**: lowercase, hyphenated (e.g., `homeassistant`)
- **Deployments**: same as app (e.g., `homeassistant`)
- **Services**: same as app
- **Ingress**: same as app with `-ingress` suffix if multiple
- **ConfigMaps**: `{app}-config` or descriptive
- **Secrets**: `{app}-secret` or Sealed Secret

## Resource Limits

Default limits applied to all pods:
```yaml
resources:
  requests:
    memory: "64Mi"
    cpu: "50m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

Adjust per application based on actual needs.

## Health Checks

All deployed apps should have:
- `readinessProbe` - ready to receive traffic
- `livenessProbe` - container is healthy
- `startupProbe` - for slow-starting apps

## Backup Strategy

- **Databases**: PVC snapshots or pg_dump/mongodump to NFS
- **Config**: In Git (Sealed Secrets)
- **Persistent data**: PVCs on NFS

## Monitoring (Future)

Planned additions:
- Prometheus + Grafana
- Loki for logs
- Alertmanager for notifications
- Blackbox exporter for uptime

## Troubleshooting

### Common Issues

1. **Pod stuck in Pending**: Check PVC, node resources, or taints
2. **ImagePullBackOff**: Verify image exists, registry accessible
3. **CrashLoopBackOff**: Check logs, resource limits
4. **Ingress 404**: Verify ingress class, host rules

### Useful Commands

```bash
# Check pod status
kubectl get pods -A

# Pod logs
kubectl logs -n <ns> <pod> -f

# Describe pod
kubectl describe -n <ns> <pod>

# Check events
kubectl get events -A --sort-by='.lastTimestamp'

# Argo CD sync
argocd app sync <app-name>
```
