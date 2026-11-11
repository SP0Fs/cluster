# Pi-hole

Network-wide ad blocker and DNS sinkhole, one instance per network.

## How it works

- One Deployment, `replicas` = number of networks. Pod anti-affinity on
  `topology.kubernetes.io/zone` allows at most one Pi-hole per network.
- Each node is labeled `topology.kubernetes.io/zone=<network>` (also used by the
  MetalLB L2Advertisements). When a pod is bound, the API server copies
  that label onto the pod (`PodTopologyLabelsAdmission`, on by default since
  1.35), so the per-network Services select `topology.kubernetes.io/zone: <network>`.
  The label must be on the node **before** the pod is scheduled.
- Services use `externalTrafficPolicy: Local`: clients keep their source IP and
  the IP is announced from the node running that network's Pi-hole.
- State (`/etc/pihole`) is a hostPath `/mnt/pihole` on each node, so every
  instance has its own config (local records, lists, clients).
- Upstream DNS is cloudflared (DoH) as a sidecar on `127.0.0.1#5053`.
- `listeningMode=all`, so either instance can serve the other network as a
  backup DNS (e.g. 192.168.179.240 as secondary DNS for marc).

## Access

| Network | Service | DNS / Web UI | Ingress |
|---|---|---|---|
| marc | `marc-pihole` | 192.168.178.128 (`/admin`) | https://pihole.leibold.tech/admin (mTLS) |
| chris | `chris-pihole` | 192.168.179.240 (`/admin`) | - |

## Adding a network

1. Label the node `topology.kubernetes.io/zone=<name>`.
2. Add a MetalLB pool + L2Advertisement pinned to `topology.kubernetes.io/zone=<name>`
   (see `infra/metallb/resources`).
3. Add `service-<name>.yaml` and bump `replicas` in `deployment.yaml`.
