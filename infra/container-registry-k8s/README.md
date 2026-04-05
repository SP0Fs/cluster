# Container Registry

Private Docker registry for the SP0Fs Kubernetes cluster.

## Overview

Self-hosted [Docker Registry](https://docs.docker.com/registry/) for storing container images internally.

## Repository Structure

```
container-registry-k8s/
├── application.yaml  # ArgoCD Application manifest
├── resources/        # Additional resources
└── values.yaml       # Helm values
```

## Usage

Push images:
```bash
docker push registry.spof.local/image:tag
```

Pull images:
```bash
docker pull registry.spof.local/image:tag
```

## Links

- Registry: https://registry.spof.local
