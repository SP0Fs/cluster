# MetalLB

Bare-metal load balancer for the SP0Fs Kubernetes cluster.

## Overview

[MetalLB](https://metallb.universe.tf/) provides LoadBalancer IPs for services on clusters without native cloud load balancers.

## Repository Structure

```
metallb-k8s/
├── application.yaml  # ArgoCD Application manifest
├── resources/        # Additional resources
└── values.yaml       # Helm values
```

## Configuration

- L2 mode for IP assignment
- Address pool configured for cluster subnet

## Links

- MetalLB in `metallb-system` namespace
