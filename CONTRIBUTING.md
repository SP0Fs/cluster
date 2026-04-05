# Contributing

## Adding a New App

### 1. Create Directory Structure

```
apps/<app-name>/
├── README.md
├── kustomization.yaml (optional)
├── namespace.yaml
├── deployment.yaml
├── service.yaml
├── ingress.yaml
├── configmap.yaml
└── secret.yaml (Sealed Secret only!)
```

### 2. Add Argo CD Application

Create `infra/argo-cd/apps/<app-name>.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: <app-name>
  namespace: argo-cd
spec:
  project: spof-cluster
  source:
    repoURL: 'https://github.com/SP0Fs/cluster.git'
    targetRevision: HEAD
    path: apps/<app-name>
  destination:
    server: "https://kubernetes.default.svc"
    namespace: <namespace>
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

### 3. Secrets

**NEVER commit plain secrets!**

Use Sealed Secrets:
```bash
# Encrypt secret
kubeseal --cert=pub-cert.pem -o yaml < secret.yaml > sealed-secret.yaml

# Add to repo
mv sealed-secret.yaml apps/<app-name>/
```

### 4. Documentation

- Update README.md with description
- Add to ARCHITECTURE.md if new infrastructure

## Updating an App

1. Make changes in `apps/<app-name>/`
2. Commit with conventional commit message
3. Argo CD auto-syncs or manual sync:
   ```bash
   argocd app sync <app-name>
   ```

## Infrastructure Changes

Infrastructure changes require careful ordering:

1. cert-manager → ingress-nginx → apps
2. Metallb → ingress-nginx
3. Argo CD → everything else

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new application
fix: resolve deployment issue
docs: update README
infra: add new infrastructure component
refactor: restructure directory
```

## Testing Changes

### Dry Run
```bash
kubectl apply --dry-run=client -k apps/<app-name>/
```

### Apply Locally
```bash
kubectl apply -k apps/<app-name>/
```

### Verify
```bash
kubectl get pods -n <namespace>
kubectl describe -n <namespace> <resource>
```

## Code Review

1. All changes via PR
2. Self-merge for small changes
3. Review for larger infrastructure changes

## Rollback

```bash
# Via Argo CD
argocd app rollback <app-name>

# Via kubectl
kubectl rollout undo deployment/<name> -n <namespace>
```
