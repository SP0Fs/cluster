# Ingress NGINX

NGINX Ingress Controller for the SP0Fs Kubernetes cluster.

## Overview

[ingress-nginx](https://kubernetes.github.io/ingress-nginx/) handles HTTP/HTTPS routing into the cluster. All ingress resources reference this controller.

## Repository Structure

```
ingress-nginx-k8s/
├── application.yaml  # ArgoCD Application manifest
└── values.yaml       # Helm values
```

## Configuration

- External IP via MetalLB
- TLS termination handled by cert-manager
- Metrics exposed for Prometheus

## Links

- Controller: ingress-nginx in `ingress-nginx` namespace
