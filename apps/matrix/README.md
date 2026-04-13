# Matrix

End-to-end encrypted messaging server.

## Overview

[Matrix](https://matrix.org/) is an open protocol for real-time communication with end-to-end encryption, bridging to other networks like IRC, Slack, and Discord.

## Repository Structure

```
matrix-k8s/
├── application.yaml  # ArgoCD Application manifest
└── resources/        # Kubernetes manifests
```

## Components

- Synapse (homeserver)
- Element (web client)

## Links

- Element: https://element.spof.local
- Namespace: `matrix`
