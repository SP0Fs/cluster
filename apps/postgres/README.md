# PostgreSQL

Relational database for cluster workloads.

## Overview

[PostgreSQL](https://www.postgresql.org/) database deployed via Bitnami Helm chart, providing persistent storage for applications.

## Repository Structure

```
postgres-k8s/
├── application.yaml  # ArgoCD Application manifest
├── resources/        # Additional resources
└── values.yaml       # Helm values
```

## Configuration

- Helm chart: bitnami/postgresql v15.5.31
- Persistent storage enabled
- Automated backups (if configured)

## Links

- Namespace: `postgres`
