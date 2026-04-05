# SP0Fs Cluster

Kubernetes cluster management monorepo for the SP0Fs home lab.

## Overview

This repository consolidates all Kubernetes manifests, configurations, and documentation for the SP0Fs cluster into a single source of truth.

## Repository Structure

```
cluster/
├── README.md           # This file
├── ARCHITECTURE.md     # System architecture
├── DESIGN.md           # Design decisions
├── CONTRIBUTING.md     # Contribution guidelines
├── apps/               # Application workloads
│   ├── homeassistant/  # Home automation
│   ├── matrix/         # Messaging server
│   ├── postgres/       # PostgreSQL database
│   ├── mongodb/        # MongoDB database
│   ├── zigbee2mqtt/    # Zigbee bridge
│   ├── mosquitto/      # MQTT broker
│   ├── myspotify/      # Spotify tracker
│   ├── pihole/         # DNS ad blocker
│   ├── esphome/        # ESP device management
│   ├── bezel/          # Digital signage
│   └── nanobot/        # AI assistant
├── infra/              # Infrastructure components
│   ├── argo-cd/         # GitOps controller
│   ├── ingress-nginx/  # Ingress controller
│   ├── metallb/        # Load balancer
│   ├── cert-manager/   # TLS certificates
│   ├── container-registry/  # Private registry
│   ├── sealed-secrets/       # Secret management
│   ├── sealed-secrets-web/   # Sealed Secrets UI
│   ├── akri/           # Resource discovery
│   ├── trivy/          # Vulnerability scanner
│   └── nfs-provisioner/       # NFS storage
└── sectors/            # Cross-cutting concerns
    ├── networking/      # Network policies, DNS
    ├── storage/         # Storage classes, PVCs
    └── security/        # RBAC, security policies
```

## Quick Start

### Prerequisites

- k3s cluster
- kubectl configured
- Argo CD installed (see `infra/argo-cd/`)

### Deploy an App

```bash
kubectl apply -k apps/<app-name>/
```

## Documentation

- [Architecture](ARCHITECTURE.md) - System architecture and topology
- [Design](DESIGN.md) - Design decisions and rationale
- [Contributing](CONTRIBUTING.md) - How to contribute

## Cluster Info

- **Cluster**: spof-cluster
- **Nodes**: 3 (1 control-plane, 2 workers)
- **GitOps**: Argo CD

## Links

- Argo CD: https://argocd.spof.local
- Registry: https://registry.spof.local
