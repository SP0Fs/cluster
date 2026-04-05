# AKRI

Distributed resource discovery for edge/IoT devices on Kubernetes.

## Overview

[AKRI](https://akri.sh/) (Applied Kubernetes Resource Interface) automatically discovers and manages networked resources like cameras, sensors, and other devices.

## Repository Structure

```
akri-k8s/
├── application.yaml  # ArgoCD Application manifest
├── resources/        # Additional resources
└── values.yaml       # Helm values
```

## Use Cases

- IP camera discovery
- USB device passthrough
- Edge node detection

## Links

- AKRI in `akri-system` namespace
