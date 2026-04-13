# Pi-hole

Network-wide ad blocker and DNS sinkhole.

## Overview

[Pi-hole](https://pi-hole.net/) blocks ads and trackers at the DNS level for the entire network.

## Repository Structure

```
pihole-k8s/
├── application.yaml  # ArgoCD Application manifest
├── resources/         # Additional resources
└── values.yaml        # Helm values
```

## Configuration

- DHCP server (optional)
- Custom blocklists
- DNS over HTTPS

## Links

- Admin UI: https://pihole.spof.local/admin
- Namespace: `pihole`
