# Migration Plan: Consolidate K8s Repos to SP0Fs/cluster

## Overview

This document outlines the migration from the current multi-repo ArgoCD setup to the consolidated `SP0Fs/cluster` monorepo with app-of-apps pattern.

**Goal:** Zero disruption to existing applications during migration.

## Current State

- **Root App:** `spof-cluster` repo → `applications/` directory
- **App Sources:** Each app's ArgoCD Application points to its own Git repo (e.g., `SP0Fs/minecraft-server-k8s`)
- **Cluster Repo:** `SP0Fs/cluster` → contains manifests in `apps/` and `infra/` directories
- **New Structure:** `SP0Fs/cluster` → `applications/` directory with app-of-apps pattern pointing to manifests in same repo

## Migration Strategy

### Phase 1: Verify New Setup (No Risk)

1. **Deploy root-application to a staging cluster** (or review ArgoCD preview)
   ```bash
   kubectl apply -f applications/root-application.yaml -n argo-cd
   ```

2. **Verify ArgoCD UI** shows all apps in `applications/apps/` and `applications/infra/` with status `OutOfSync` (not yet actively managed)

3. **Do NOT enable automated sync yet** - keep existing apps running

### Phase 2: Parallel Running (Safe)

1. **Enable root-application sync** in ArgoCD UI:
   - Set `spec.syncPolicy.automated` if not already set
   - Or manually sync once to start managing apps from `cluster` repo

2. **Existing apps continue running** from their original repos because:
   - The `source.repoURL` in each app's Application points to `SP0Fs/cluster`
   - The `path` points to `apps/<app-name>` or `infra/<infra-name>`
   - No changes to deployed resources until a new sync is triggered

3. **Monitor ArgoCD** for any sync errors

### Phase 3: Cut Over

1. **Once all apps show healthy** in ArgoCD from the `cluster` repo
2. **Disable/remove old Application definitions** in `spof-cluster/applications/`
3. **Archive the spof-cluster repo** or point its root-application to `SP0Fs/cluster`

### Phase 4: Deprecate Old Repos

After confirming stability (1-2 weeks):

1. **Archive individual k8s repos**:
   - `SP0Fs/minecraft-server-k8s` → already archived in `cluster/archive/`
   - `SP0Fs/factorio-server-k8s` → already archived in `cluster/archive/`
   - `SP0Fs/github-actions-runner-k8s` → already archived in `cluster/archive/`
   - `SP0Fs/bastion-host-k8s` → already archived in `cluster/archive/`

2. **Update spof-cluster root-application** to reference `SP0Fs/cluster`:
   ```yaml
   spec:
     source:
       repoURL: "https://github.com/SP0Fs/cluster.git"
       targetRevision: HEAD
       path: applications
   ```

## Verification Checklist

- [ ] All apps show `Synced` and `Healthy` in ArgoCD
- [ ] No pods restarted during migration
- [ ] Ingress endpoints still responding
- [ ] Persistent data intact (PVCs not modified)

## Rollback Plan

If issues occur:

1. **Disable automated sync** on root-application
2. **Revert spof-cluster root-application** to point to original repos
3. **Individual apps will sync from their original repos** and resume normal operation

## CI/CD Activation

When ready to enable CI/CD (in `.github/workflows.disabled/`):

1. Move workflows back to `.github/workflows/`
2. Add required secrets:
   - `ARGOCD_TOKEN` - ArgoCD API token
   - `ARGOCD_SERVER` - ArgoCD server hostname
3. Workflows will then:
   - Validate manifests on PRs
   - Sync to cluster on push to main

## File Locations

| Purpose | Path |
|---------|------|
| App manifests | `apps/<name>-k8s/` or `apps/<name>/` |
| Infra manifests | `infra/<name>-k8s/` |
| ArgoCD App definitions | `applications/apps/<name>.yaml` |
| ArgoCD Infra definitions | `applications/infra/<name>.yaml` |
| Root app-of-apps | `applications/root-application.yaml` |
| Archived repos | `archive/<name>-k8s/` |
| Disabled workflows | `.github/workflows.disabled/` |
