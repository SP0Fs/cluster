# NFS Provisioner

NFS Storage Class provisioner for Kubernetes.

## Overview

[ NFS Subdir External Provisioner](https://github.com/kubernetes-sigs/nfs-subdir-external-provisioner) dynamically provisions NFS-backed persistent volumes.

## Repository Structure

```
nfs-provisioner-k8s/
├── application.yaml  # ArgoCD Application manifest
└── values.yaml       # Helm values
```

## Usage

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-data
spec:
  storageClassName: nfs-client
  accessModes: [ReadWriteMany]
  resources:
    requests:
      storage: 1Gi
```

## Links

- StorageClass: `nfs-client`
