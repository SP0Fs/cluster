# Longhorn

Distributed block storage for Kubernetes with RWX support.

## Overview

[Longhorn](https://longhorn.io/) provides cloud-native distributed block storage with:

- **RWX (ReadWriteMany)** volumes via built-in NFS server
- **3-way replication** across nodes for high availability
- **Snapshots & backups** built-in
- **UI Dashboard** for volume management
- **CSI-compatible** — works with any Kubernetes workload

## Repository Structure

```
longhorn/
├── application.yaml  # ArgoCD Application manifest
├── values.yaml       # Helm values
└── README.md         # This file
```

## Usage

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-data
spec:
  storageClassName: longhorn
  accessModes: [ReadWriteMany]
  resources:
    requests:
      storage: 10Gi
```

## Volume Types

| Access Mode | Use Case | Protocol |
|-------------|----------|----------|
| ReadWriteOnce | Single-pod, databases | Block |
| ReadWriteMany | Multi-pod, shared storage | NFS |

## Requirements

- 3 nodes recommended for replication
- Minimum 2GB free RAM per node for Longhorn components

## StorageClass

- Name: `longhorn`
- Replica count: 3
- Expandable: yes

## Links

- [Longhorn Docs](https://longhorn.io/docs/)
- [GitHub](https://github.com/longhorn/longhorn)
