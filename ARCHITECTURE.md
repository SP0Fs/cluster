# Architecture

## Overview

The SP0Fs cluster is a self-hosted Kubernetes (k3s) cluster running on a mix of physical hardware, providing home automation, messaging, development infrastructure, and media services.

## Cluster Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        SP0Fs Cluster                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ hp-elitedesk │  │    c-nuc7    │  │     rpi3     │          │
│  │  (control)   │  │   (worker)   │  │   (worker)   │          │
│  │ 192.168.178  │  │ 192.168.179  │  │ 192.168.178  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘          │
│         │                 │                                    │
│         └────────────┬────┘                                    │
│                      │                                         │
│              ┌───────▼───────┐                                 │
│              │  k3s network  │                                 │
│              └───────┬───────┘                                 │
│                      │                                         │
│  ┌───────────────────┼───────────────────────────────────┐      │
│  │              Namespaces                               │      │
│  ├─────────────┬─────────────┬─────────────────────────┤      │
│  │   APPS      │   INFRA      │   SYSTEM               │      │
│  ├─────────────┼─────────────┼─────────────────────────┤      │
│  │ homeassistant│ metallb     │ kube-system            │      │
│  │ matrix       │ ingress-nginx│ argo-cd                │      │
│  │ postgres     │ cert-manager│ kube-node-lease        │      │
│  │ mongodb      │ argo-cd     │                        │      │
│  │ zigbee2mqtt │ nfs-provisioner                      │      │
│  │ mosquitto    │ sealed-secrets                      │      │
│  │ myspotify    │ trivy        │                       │      │
│  │ pihole       │ akri         │                       │      │
│  │ esphome      │ container-registry                   │      │
│  │ bezel        │             │                        │      │
│  │ nanobot      │             │                        │      │
│  └─────────────┴─────────────┴─────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

## Network Architecture

```
External Network (192.168.178.0/24)
        │
        ├── Metallb (L2) ──── LoadBalancer IPs
        │
        ├── Ingress-NGINX ──── HTTP/HTTPS routing
        │       │
        │       ├── homeassistant.spof.local
        │       ├── matrix.spof.local
        │       ├── pihole.spof.local
        │       └── ...
        │
        └── DNS (pihole) ──── Block ads/trackers
```

## Component Roles

### Infrastructure Layer

| Component | Namespace | Purpose |
|-----------|-----------|---------|
| **MetalLB** | metallb-system | LoadBalancer IP allocation |
| **ingress-nginx** | ingress-nginx | HTTP/HTTPS routing |
| **cert-manager** | cert-manager | Automated TLS certificates |
| **Argo CD** | argo-cd | GitOps deployment |
| **Sealed Secrets** | sealed-secrets | Git-safe secret encryption |
| **Trivy** | trivy-system | Vulnerability scanning |
| **AKRI** | akri-system | Device discovery |
| **NFS Provisioner** | nfs-provisioner | Persistent storage |

### Application Layer

| App | Namespace | Purpose | External Access |
|-----|-----------|---------|-----------------|
| **Home Assistant** | homeassistant | Home automation hub | homeassistant.spof.local |
| **Matrix** | matrix | E2E encrypted messaging | matrix.spof.local |
| **Element** | matrix | Matrix web client | element.spof.local |
| **PostgreSQL** | postgres | Relational database | Internal only |
| **MongoDB** | mongodb | Document database | Internal only |
| **Zigbee2MQTT** | zigbee2mqtt | Zigbee bridge | zigbee2mqtt.spof.local |
| **Mosquitto** | mosquitto | MQTT broker | Internal only |
| **ESPHome** | esphome | ESP device management | esphome.spof.local |
| **Pi-hole** | pihole | DNS ad blocking | pihole.spof.local |
| **My Spotify** | your-spotify | Spotify statistics | spotify.spof.local |
| **Bezel** | bezel | Digital signage | - |
| **nanobot** | nanobot | AI assistant | Matrix channel |

## Data Flow

### External Traffic
```
User → DNS (Pi-hole) → External IP → Metallb → Ingress-NGINX → Service → Pod
                                                              ↓
                                                      cert-manager (TLS)
```

### Home Automation
```
Zigbee Device → Zigbee Coordinator → zigbee2mqtt → Mosquitto (MQTT)
                                                       ↓
                                              Home Assistant → User
```

### Messaging
```
User (Element) → Matrix Protocol → Synapse → nanobot
                                          ↓
                                   LLM Provider
```

## Storage

### Storage Classes

| Class | Provisioner | Purpose |
|-------|-------------|---------|
| **local-path** | rancher.io/local-path | Default (node-local) |
| **nfs-client** | nfs-subdir-external-provisioner | Shared storage |

### Persistence Strategy

- **Databases** (PostgreSQL, MongoDB): NFS or local-path with PVC
- **Config data** (Home Assistant, Zigbee2MQTT): PVC
- **Ephemeral**: No PVC required

## Security

### Secret Management

- Secrets encrypted with Sealed Secrets
- Only Sealed Secrets controller can decrypt
- Sealed secrets committed to Git

### Network Policies

- Default deny all
- Explicit allow rules per namespace
- Ingress via ingress-nginx only

### Vulnerability Management

- Trivy scans images on deploy
- Regular scanning via Trivy Operator

## GitOps Flow

```
GitHub (this repo)
       │
       ↓
Argo CD (detects changes)
       │
       ↓
Sync Applications
       │
       ↓
Cluster State = Git State
```

## Hardware

| Node | Type | Role | Resources |
|------|------|------|-----------|
| hp-elitedesk | HP EliteDesk | control-plane | 8GB RAM, i5 |
| c-nuc7 | Intel NUC | worker | 8GB RAM |
| rpi3 | Raspberry Pi 3 | worker | 1GB RAM |
