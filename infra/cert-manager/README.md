# cert-manager

Automated TLS certificate management for the SP0Fs Kubernetes cluster.

## Overview

[cert-manager](https://cert-manager.io/) provisions and manages TLS certificates from Let's Encrypt (or other issuers) automatically.

## Repository Structure

```
cert-manager-k8s/
├── application.yaml  # ArgoCD Application manifest
├── resources/        # Issuer definitions
└── values.yaml       # Helm values
```

## Issuers

- Let's Encrypt (via ACME protocol)
- Certificates auto-renew before expiry

## Links

- cert-manager in `cert-manager` namespace
