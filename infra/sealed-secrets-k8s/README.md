# Sealed Secrets

Cryptographic secret management for GitOps on the SP0Fs cluster.

## Overview

[Bitnami Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) encrypts Kubernetes Secrets so they can be safely committed to Git.

## Repository Structure

```
sealed-secrets-k8s/
├── application.yaml  # ArgoCD Application manifest
└── values.yaml       # Helm values
```

## Usage

1. Install kubeseal CLI
2. Encrypt secrets: `kubeseal --cert=pub-cert.pem -o yaml < secret.yaml > sealed-secret.yaml`
3. Commit sealed secret to Git

Only the Sealed Secrets controller can decrypt them.

## Links

- Sealed Secrets controller in `sealed-secrets` namespace
