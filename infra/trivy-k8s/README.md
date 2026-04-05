# Trivy Operator

Kubernetes vulnerability scanner and compliance tool.

## Overview

[Trivy Operator](https://aquasecurity.github.io/trivy-operator/) provides continuous vulnerability scanning for cluster workloads and configuration checks.

## Repository Structure

```
trivy-k8s/
├── application.yaml  # ArgoCD Application manifest
└── values.yaml       # Helm values
```

## Features

- Image vulnerability scanning
- ConfigAudit (Kubernetes security configs)
- RBAC assessment
- Exporter for Prometheus metrics

## Links

- Trivy in `trivy-system` namespace
