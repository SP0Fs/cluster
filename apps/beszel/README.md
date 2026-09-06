# Beszel

Lightweight server monitoring: hub (PocketBase-backed web UI) plus one agent
per node (DaemonSet) streaming CPU/memory/disk/network/ZFS/GPU metrics.

## Architecture

- **Namespace:** `monitoring`
- **Hub:** Deployment (`beszel-hub`) behind ClusterIP service on port 8090,
  exposed externally via `beszel.leibold.tech` (Ingress with cert-manager
  mTLS client cert + Let's Encrypt server cert)
- **Agent:** DaemonSet (`beszel-agent`) on every node, port 45876, talks to
  hub via HTTP

## Files

```
apps/beszel/
├── README.md          # this file
├── values-hub.yaml    # overrides for the official beszel-hub Helm chart
└── values-agent.yaml  # overrides for the official beszel-agent Helm chart
```

The two Helm charts live in the official `henrygd/beszel` repo under
`supplemental/helm/beszel-hub` and `supplemental/helm/beszel-agent`,
published as OCI artifacts at `oci://ghcr.io/henrygd/beszel-charts/`.

## Why we migrated from raw manifests

Before this PR the agent DaemonSet had `KEY: "<hub-public-key>"` literally
baked in as an env var. Both agent pods (one per node) crashed for **145
days** with:

```
Failed to load public keys: failed to parse key: <hub-public-key>, error:
ssh: no key found
```

In addition to the missing key:
- Image was pinned to `:latest` (security/CVE drift since April 2026)
- Resources had no `limits` (could starve neighbors on small nodes)
- No `app.kubernetes.io/*` labels (poor discoverability in Lens/ArgoCD)
- README claimed this was a "digital signage display manager" (it's not —
  it was just stale copy-paste from another repo)

## One-time setup after the first sync

The agent chart is configured with both `env.KEY` and
`secret.existingSecret` empty. The chart's `templates/secret.yaml` fails
the render with `env.KEY is required when not using an existingSecret` if
no Secret named `beszel-agent` (the chart's default fullname) exists in
the `monitoring` namespace. So the first ArgoCD sync will stay Pending
until you bootstrap the Secret manually.

After the hub Deployment has started at least once (its first-run boots
generates the SSH keypair on the PVC), create the Secret from your laptop:

**a) Pull the public key straight out of the hub pod:**
```bash
HUB_POD=$(kubectl -n monitoring get pod \
  -l app.kubernetes.io/name=beszel-hub \
  -o jsonpath='{.items[0].metadata.name}')
kubectl -n monitoring exec "$HUB_POD" -- \
  cat /beszel_data/*pub_key | \
  kubectl -n monitoring create secret generic beszel-agent \
    --from-file=ssh-key=/dev/stdin
```

**b) Or paste the public key from the hub UI:**
```bash
kubectl -n monitoring create secret generic beszel-agent \
  --from-literal=ssh-key='ssh-ed25519 ...'
```

ArgoCD's self-heal picks up the new Secret within seconds and starts the
agent DaemonSet on both nodes. From then on the chart manages the Secret
itself — you don't need to touch it again.

## Verification

After merge:

```bash
# Hub should be 1/1 ready
kubectl -n monitoring get deploy beszel-hub

# Both nodes should have a running agent (DaemonSet)
kubectl -n monitoring get ds beszel-agent

# External reachability (after cert-manager finishes)
curl -I https://beszel.leibold.tech/
```

### Migration note (one-time, only when upgrading from the pre-PR setup)

The old ArgoCD Application was named `bezel` and tracked the Ingress with
`argocd.argoproj.io/tracking-id: bezel:networking.k8s.io/Ingress:monitoring/beszel-ingress`.
This PR renames it to `beszel`, so ArgoCD will see the existing Ingress as
un-owned and **replace** it on the first sync. Replacement is idempotent
(name + annotations + spec match), but the cert-manager TLS secret gets
re-issued (~30s) and the mTLS-protected UI is briefly unavailable. No
manual intervention needed.

## Uninstall

```bash
kubectl -n monitoring delete application beszel   # via ArgoCD UI/CLI
# or: argocd app delete beszel -n argo-cd
```
