# TODO

## High Priority

- [ ] Fix kubectl RBAC for nanobot service account
- [ ] Verify all apps sync correctly in Argo CD
- [ ] Test disaster recovery (restore from Git)

## Medium Priority

- [x] ~~Fix kubectl RBAC for nanobot service account~~ → completed 2026-04-06
- [ ] Set up monitoring stack (Prometheus + Grafana)
- [ ] Configure Loki for log aggregation
- [ ] Set up alerting with Alertmanager
- [ ] Regular backup schedule for databases
- [ ] Document backup/restore procedures
- [ ] Pin nanobot image to a specific tag (not `latest`) in `apps/nanobot/resources/deployment.yaml`

### openclaw

- [ ] Replace placeholder secrets in `openclaw-secrets` with real API keys (MINIMAX_API_KEY)
- [ ] Configure Matrix channel in `openclaw.json` (homeserver, userId, accessToken)
- [ ] Verify Control UI accessible at http://localhost:18789
- [ ] Verify Matrix connection — bot joins and responds to DMs
- [ ] Verify Matrix E2EE works (encrypted DM, verify device in Element)
- [ ] Verify PVC data persists across pod restarts
- [ ] Pin openclaw image to SHA tag in `apps/openclaw/resources/deployment.yaml`

## Low Priority

- [ ] Set up Vault for additional secret management
- [ ] Add network policies to all namespaces
- [ ] Implement service mesh (Istio/Linkerd) for observability
- [ ] Set up continuous vulnerability scanning

## Ideas

- [ ] GitHub Actions runner for CI/CD
- [ ] Self-hosted runner for GitOps
- [ ] External DNS with cert-manager (DNS-01 challenge)
- [ ] Multiple replicas for critical services
- [ ] GPU support for ML workloads

## Deprecations

- [ ] Remove separate openclaw repo after migration complete
- [ ] Remove separate app repos after migration complete

---

*Last updated: 2026-04-13*
