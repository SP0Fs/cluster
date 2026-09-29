# OpenThread Border Router (OTBR) on Kubernetes — Research Report

**Date:** 2026-09-29
**Cluster context:** k3s v1.36.3+k3s1 on Ubuntu 24.04 (amd64, kernel 6.8), control-plane `hp-elitedesk` + worker `c-nuc7`. Existing reference app: `apps/zigbee2mqtt` (Akri + Silicon Labs CP210x).

---

## 1. Official Docker image

- **Image:** `openthread/border-router` on Docker Hub (https://hub.docker.com/r/openthread/border-router)
- **Repo:** https://github.com/openthread/ot-br-posix
- **Architectures:** `linux/amd64`, `linux/arm64`, `linux/arm/v7` (multi-arch manifest list, source: https://github.com/openthread/ot-br-posix/blob/main/.github/workflows/docker-border-router.yml)
- **Tags available (verified live, 2026-09-29):**
  - `latest` — rebuilt on every push to `main`
  - `stable` — assigned to official monthly CalVer releases (e.g. `2026.09.0` was the most recent at the time of writing; release v2026.09.0 was tagged 2026-09-01, source: https://github.com/openthread/ot-br-posix/releases/tag/v2026.09.0)
  - `main` — same image as `latest` (re-tagged on push)
  - `sha-<short>` — immutable digests, useful for reproducibility
  - `2026.09.0`, `2026.08.0`, `2026.07.0`, etc. — explicit CalVer tags

  > **Recommendation:** pin a CalVer tag (e.g. `openthread/border-router:2026.09.0` or `:stable`) in production. Avoid `:latest` because it shifts with each main-branch build (release cadence is monthly).

- **Latest verified stable release:** `v2026.09.0` (2026-09-01), Docker image `openthread/border-router:2026.09.0` (Digest `sha256:2be5082e7dea0e55fde95e2aea6e6176c162b3097f62a530a27593aa6b609455` on amd64 — confirmed via Docker Hub API).

---

## 2. Runtime requirements (what the image needs)

All findings are from the **official source files** at https://github.com/openthread/ot-br-posix/tree/main/etc/docker/border-router (no official `README.md` — only the Dockerfile, `otbr-env.list`, `setup-host` script, and s6-overlay service definitions).

### a) Host network — **REQUIRED**

The official Docker install doc (https://openthread.io/guides/border-router/docker) and the upstream `otbr-agent` run script explicitly assume `--network=host`. From `otbr-agent/run`:

> "With `--network host` these rules are created in the host's netfilter namespace and outlive the container..."

It is also confirmed by the Home Assistant add-on `config.yaml` (`host_network: true`) — the upstream-maintained OTBR variant shipped to HA users is hard-coded to host network.

**Implication for k3s:** the OTBR pod must run with `hostNetwork: true` and `dnsPolicy: ClusterFirstWithHostNet` (so CoreDNS still works). The pod effectively lives in the host's network namespace.

### b) Privileged mode — **OPTIONAL but typical**

The **upstream** Docker run command does **not** use `--privileged` — only `--cap-add=NET_ADMIN`. However:

- The **community-validated** working docker-compose at https://github.com/openthread/openthread/discussions/13290 uses `privileged: true` + `cap_add: [NET_ADMIN, SYS_ADMIN]` to silence iptables quirks on Bookworm (Debian 12).
- The **Home Assistant add-on** at https://github.com/home-assistant/addons/blob/master/openthread_border_router/config.yaml uses `privileged: [IPC_LOCK, NET_ADMIN]` — *not* full privileged; it adds only the specific capabilities it needs (IPC_LOCK for mDNSResponder real-time scheduling, NET_ADMIN for netfilter/interface).

`SYS_ADMIN` is needed only if you want to run the legacy `ipset`+`ip6tables` firewall inside the container (which `otbr-agent/run` does by default unless `OTBR_NFTABLES=1`). With the newer nftables backend (added in 2026.09, PR #3325), `SYS_ADMIN` is no longer required, but `NET_ADMIN` still is.

**Implication for k3s:** grant `NET_ADMIN` capability. Full `privileged: true` is *not required* and should be avoided if your security model allows it. If you want a drop-in equivalent of the HA add-on, use `privileged: [NET_ADMIN, IPC_LOCK]`.

### c) Capabilities needed

| Capability | Why | Source |
|---|---|---|
| `NET_ADMIN` | configure `wpan0` interface, set IPv6 forwarding, manage `ip6tables`/`ipset` ingress rules, configure `trel://` over infra iface | `otbr-agent/run`, official docker doc |
| `IPC_LOCK` (optional) | `mDNSResponder` uses `mlock()` for real-time scheduling | HA add-on config.yaml |
| `SYS_ADMIN` (optional) | only needed for legacy ipset backend; can be skipped with `OTBR_NFTABLES=1` env var | otbr-agent/run comments |

### d) `/dev/net/tun` — **REQUIRED**

The container creates a virtual `wpan` interface (default name `wpan0`) inside its network namespace. From the s6 run script it explicitly opens TUN-style interfaces. The official docker doc lists `--device=/dev/net/tun`.

### e) Exposed ports

The container does **not** declare `EXPOSE` in its Dockerfile, but the s6 services bind these ports by default:

| Port | Service | Default listen addr | Env var |
|---|---|---|---|
| **8081/tcp** | OTBR REST API (used by Home Assistant and Matter commissioning) | `127.0.0.1` | `OT_REST_LISTEN_ADDR` / `OT_REST_LISTEN_PORT` |
| **8080/tcp** | OTBR Web GUI (commissioning, network view) | `127.0.0.1` | `OT_WEB_LISTEN_ADDR` / `OT_WEB_LISTEN_PORT` |
| **19791/udp** | Border Agent mDNS / MeshCoP service discovery (`_meshcop._udp`) | mDNSResponder | n/a |
| **61616/udp** (approx) | TREL service discovery (`_trel._udp`) | mDNSResponder | n/a |

**Important:** Both HTTP ports default-bind to **`127.0.0.1` only**. Because the container uses `hostNetwork`, "127.0.0.1" inside the container is the host's loopback — which works for HA on the same node, but for remote access you must override:

```
OT_REST_LISTEN_ADDR=0.0.0.0
OT_WEB_LISTEN_ADDR=0.0.0.0
```

The HA add-on binds these on the supervisor network (no env override needed in HA's case). The k3s pattern is to set both to `0.0.0.0` if you want to access the Web UI from outside the host (or to a host LAN IP if you want to scope it).

For mDNS/UDP ports: with `hostNetwork: true`, no port mapping is needed — they're already on the host's interfaces.

### f) Radio interface — **REQUIRED on a USB serial device (RCP design)**

The default RCP URL is `spinel+hdlc+uart:///dev/ttyACM0?uart-baudrate=1000000` (from `otbr-env.list` and `otbr-agent/run`). The container needs the host's serial device passed in:

- **TI CC2652 / CC1352** RCP: appears as `/dev/ttyACM0` — same as the upstream default.
- **Nordic nRF52840** RCP: appears as `/dev/ttyACM0` (when flashed with `-DOT_BOOTLOADER=USB` per the official Prepare guide: https://openthread.io/guides/border-router/prepare).
- **Silicon Labs EFR32** (e.g. ZBT-1, ZBT-2, MGM24): appears as `/dev/ttyACM0` or `/dev/ttyUSB0` depending on the adapter; ConBee III / RaspBee II use `/dev/ttyUSB0` (see https://github.com/openthread/openthread/discussions/12254).
- **USB-NCP** firmware is also supported via the same spinel+hdlc+uart driver.

Device is bound by `--device=/dev/ttyACM0` (or whichever `/dev/ttyACMx` / `/dev/ttyUSBx` appears on your node).

### g) Data persistence

The container expects `/data` to be writable and stores the Thread dataset, Border Agent ID, and IP address count there (see `otbr-agent/run`: `mkdir -p /data/thread && ln -sft /var/lib /data/thread`). Mount a hostPath like `/var/lib/otbr` at `/data` (the official docker doc uses exactly this).

---

## 3. Recommended docker run / systemd flags (from the official docs)

**From https://openthread.io/guides/border-router/docker (last updated 2026-09-28):**

```bash
# (run once per host)
curl -sSL https://raw.githubusercontent.com/openthread/ot-br-posix/refs/heads/main/etc/docker/border-router/setup-host | bash

# otbr-env.list
OT_RCP_DEVICE=spinel+hdlc+uart:///dev/ttyACM0?uart-baudrate=1000000
OT_INFRA_IF=wlan0        # ← change to your eth0/eth1 LAN interface on the cluster node
OT_THREAD_IF=wpan0
OT_LOG_LEVEL=7

docker run --name=otbr \
  --detach \
  --network=host \
  --cap-add=NET_ADMIN \
  --device=/dev/ttyACM0 \
  --device=/dev/net/tun \
  --volume=/var/lib/otbr:/data \
  --env-file=otbr-env.list \
  --restart=always \
  openthread/border-router
```

The `setup-host` script (https://github.com/openthread/ot-br-posix/blob/main/etc/docker/border-router/setup-host) enables IPv4 and IPv6 forwarding on the host and sets `accept_ra=2` on the infra interface. Defaults to `wlan0`; override with `INFRA_IF_NAME=eth0` for an Ethernet-backed node.

**Translated to systemd (no Kubernetes), the same flags are:**

```
ExecStart=/usr/bin/docker run --rm \
  --name otbr \
  --network=host \
  --cap-add=NET_ADMIN \
  --device=/dev/ttyACM0 \
  --device=/dev/net/tun \
  --volume=/var/lib/otbr:/data \
  --env-file=/etc/otbr/otbr-env.list \
  openthread/border-router:2026.09.0
```

---

## 4. RCP / NCP firmware provision

The OTBR container does **not** flash the radio — the RCP/NCP firmware must already be on the attached USB stick before OTBR starts. All three common adapters are supported via the same `spinel+hdlc+uart://` driver and `/dev/ttyACM0` (or `ttyUSB0`).

### Homelab recommendations

| Radio | Typical use | Where to flash | Default serial path |
|---|---|---|---|
| **Home Assistant Connect ZBT-1 / ZBT-2** | Home Assistant official | ZBT-1/ZBT-2 hardware flasher via Web GUI, or `universal-silabs-flasher` CLI | `/dev/ttyACM0` |
| **SkyConnect (v1)** | Same as ZBT-1, rebranded | `universal-silabs-flasher` CLI or HA | `/dev/ttyACM0` |
| **TI LAUNCHXL-CC1352P-2** | Dev/eval board | TI UniFlash | `/dev/ttyACM0` or `/dev/ttyUSB0` |
| **Nordic nRF52840 USB Dongle** | Dev/eval | `nrfjprog` or `mcumgr`; build RCP firmware with `-DOT_BOOTLOADER=USB` per openthread.io/guides/border-router/prepare | `/dev/ttyACM0` |
| **Silicon Labs EFR32 (MGM24, BRD4166A, etc.) | Generic SiLabs dev | Simplicity Studio or `commander` | `/dev/ttyACM0` / `ttyUSB0` |
| **ConBee III / RaspBee II** | Often Zigbee-only; OTBR-capable after reflashing | `GCFFlasher` | `/dev/ttyUSB0` |

**For a homelab user**, the simplest path is the Home Assistant Connect ZBT-1 or ZBT-2 (≈ $30 USD): plug it in, HA auto-flashes the RCP firmware through its add-on, and it appears at `/dev/ttyACM0` with the default baud rate of 460800. If you want the upstream OTBR Docker image (no HA), use `universal-silabs-flasher --device /dev/ttyACM0 --flash --firmware openthread` to write the RCP image first.

Note: the ZBT-2 default firmware is Zigbee (Zigbee-only); you must flash it to OTBR via `universal-silabs-flasher` or via HA's "OpenThread Border Router add-on" → "Re-flash" button before OTBR will work.

**Akri caveat (relevant to Marc):** OTBR needs the serial device **exclusively** for the lifetime of the OTBR pod. If you also want a Zigbee2MQTT pod on the same node, the USB stick can only be assigned to one of them at a time. **Plan to use a second USB radio stick for OTBR** (or assign the stick to whichever workload is currently active via Akri's broker hook).

---

## 5. Home Assistant Matter integration as of 2026

Source: https://www.home-assistant.io/integrations/matter/ (HA docs version 2026.9.4, current).

### How Matter works in HA now

- HA bundles a **Matter integration** (core component, ships in `homeassistant/components/matter/`).
- The integration connects via WebSocket to a **Matter Server** (the "controller") that runs as a separate process/container. HA cannot commission devices without it.
- The Matter Server is shipped as a **Home Assistant App** (formerly an "add-on") called **Open Home Foundation Matter Server**:
  - Image: `homeassistant/{arch}-addon-matter-server`
  - Docker Hub: https://hub.docker.com/r/homeassistant/amd64-addon-matter-server
  - Latest tag at 2026-09: `latest` / `9.2.0` / `9.1.1` etc.
  - Source: https://github.com/home-assistant/addons/tree/master/matter_server
  - Repo: https://github.com/home-assistant-libs/python-matter-server
- **The Matter Server has been migrated to JavaScript:** as of 2026, the Python implementation is deprecated. The new server lives at https://github.com/matter-js/matterjs-server and is published as `ghcr.io/matter-js/matterjs-server:stable` (latest at 2026-09: `9.2.0`, `9.1.1`, …). The HA add-on has a "Beta" track that switches to the JS server; HA's bundled app will fully migrate soon.

### How the OTBR fits in

- The **Thread integration** (https://www.home-assistant.io/integrations/thread/) is auto-populated when HA detects a border router that exposes its REST API.
- HA discovers OTBR on the network via **mDNS `_meshcop._udp`** (Border Agent) or by reading the REST API at port 8081.
- HA's Matter integration talks to the Matter Server (controller) over WebSocket; the Matter Server talks to OTBR via Thread credentials shared through HA's `Thread` integration (which stores the Thread dataset).
- The Thread network credentials are also synced to your phone (via the Home Assistant Companion app) so it can commission new Matter-over-Thread devices.

### Recommended setup for a k3s user (Marc)

1. **Run the OTBR container on the k3s cluster** (this report's subject) — it provides the Thread radio + border router for IPv6.
2. **Run a separate Matter Server container** in the same cluster:
   - Image: `ghcr.io/home-assistant-libs/python-matter-server:stable` (currently still supported; or `ghcr.io/matter-js/matterjs-server:stable` if you want the JS-based server). WebSocket port `5580` is the default.
3. **HA's Matter integration** connects to that Matter Server over WebSocket and reads the Thread credentials from OTBR's REST API (`http://<otbr-host>:8081`). No port-forwarding is needed inside the cluster; just an HA-internal Service pointing at the Matter Server pod.
4. **You do NOT need the HA OpenThread Border Router add-on.** You can absolutely skip it and use the upstream `openthread/border-router` image instead — they are *functionally equivalent* (the HA add-on is a re-spin that just wraps the upstream image with the supervisor lifecycle). The HA docs explicitly call this out: *"If you are using OpenThread (for Connect ZBT-1, ZBT-2, or SkyConnect) as border router, make sure you followed the steps in the Thread documentation."* (https://www.home-assistant.io/integrations/thread/, last updated 2026).

### Architecture overview

```
[ Matter devices (Thread radio) ]
              │ 802.15.4
[ RCP USB stick at /dev/ttyACM0 ]
              │ USB serial
[ OTBR pod (hostNetwork, NET_ADMIN, /dev/net/tun) ]──> host's IPv6 stack
              │
              │ HTTP REST (8081) + mDNS MeshCoP (19791)
              ▼
[ Matter Server pod (WebSocket 5580) ]──┐
                                         │ WebSocket
[ Home Assistant pod (Matter integration) ]
                                         │
                                         │ mDNS to commissioning clients
[ Phone (HA Companion app) ]
```

---

## 6. NetworkManager / netplan considerations on Ubuntu 24.04 nodes

Ubuntu 24.04 ships with **Netplan as the renderer for NetworkManager** (or for `systemd-networkd` in server-only setups). For an OTBR node you need to be aware of three interactions:

### a) `wpan0` MUST NOT be managed by NetworkManager

If NetworkManager sees the `wpan0` interface (the TUN device created by OTBR-agent), it may try to take ownership, assign a default route, or tear it down. The conventional mitigation:

```ini
# /etc/NetworkManager/conf.d/otbr.conf
[keyfile]
unmanaged-devices=interface-name:wpan*;interface-name:trel*;interface-name:lowpan*
```

Then restart NetworkManager: `sudo systemctl restart NetworkManager`.

This is a well-known requirement in the OTBR on Linux community — multiple HA forum and openthread discussions reference it (e.g. https://github.com/openthread/openthread/discussions/10311). **The official OTBR documentation does not mention NetworkManager by name**, but the `setup-host` script (https://github.com/openthread/ot-br-posix/blob/main/etc/docker/border-router/setup-host) bypasses the issue by enabling `net.ipv6.conf.all.forwarding=1` globally on the host, which is independent of NetworkManager.

### b) IPv6 forwarding must be enabled host-wide

The `setup-host` script writes `/etc/sysctl.d/60-otbr-ip-forward.conf`:

```
net.ipv6.conf.all.forwarding = 1
net.ipv4.ip_forward = 1
```

And `/etc/sysctl.d/60-otbr-accept-ra.conf`:

```
net.ipv6.conf.${INFRA_IF_NAME}.accept_ra = 2
net.ipv6.conf.${INFRA_IF_NAME}.accept_ra_rt_info_max_plen = 64
```

For Marc's cluster, run this **on each OTBR node** before starting the OTBR pod:

```bash
sudo tee /etc/sysctl.d/60-otbr.conf >/dev/null <<EOF
net.ipv6.conf.all.forwarding = 1
net.ipv4.ip_forward = 1
EOF
sudo sysctl -p /etc/sysctl.d/60-otbr.conf
```

### c) `accept_ra=2` is required on the infra interface

This allows the node to receive Router Advertisements with route info, which OTBR needs to learn upstream routes from the LAN. On Ubuntu 24.04 + NetworkManager, set this via a dispatcher script (because NM will overwrite `/proc` values on reconnect). Example:

```bash
# /etc/NetworkManager/dispatcher.d/99-otbr
#!/bin/sh
if [ "$1" = "eth0" ]; then
  sysctl -w net.ipv6.conf.eth0.accept_ra=2
  sysctl -w net.ipv6.conf.eth0.accept_ra_rt_info_max_plen=64
fi
```

Or in a netplan YAML:

```yaml
network:
  version: 2
  renderer: NetworkManager
  ethernets:
    eth0:
      dhcp6: true
      accept-ra: true
      ipv6-privacy: false
```

### d) k3s-specific gotcha

k3s uses **Flannel by default with the `kube-flannel` DaemonSet**. Flannel creates its own CNI interfaces (`flannel.1`, `cni0`) and runs iptables rules. Because OTBR writes its own `ip6tables` rules to the host's netfilter namespace (and `--network=host` makes "the host's netfilter" the same as the pod's), there is **no conflict** in practice — but be aware that Flannel's IPv6 rules (if you enable IPv6 in Flannel) may interact with OTBR's ingress chain. **Keep Flannel on IPv4-only** (the k3s default) to avoid surprises.

---

## 7. Relationship between OTBR and HA's native Matter support

- HA's Matter support (the `matter` integration in core) requires a Matter controller (the Matter Server). The controller *can* run elsewhere (anywhere with WebSocket reachability to HA).
- The Matter controller in turn *requires* Thread credentials when commissioning a Thread-based Matter device. Those credentials come from a Thread Border Router (either HA's add-on, or any OpenThread-based BR exposing its REST API).
- HA's Thread integration auto-detects any OTBR exposing the REST API at port 8081 (it discovers the Border Agent's mDNS service and then pulls the dataset from the REST API). It does not require the OTBR HA add-on.
- **You can absolutely skip HA's "OpenThread Border Router add-on"** and use the upstream `openthread/border-router` Docker image. The HA add-on is a convenience wrapper (auto-flasher for ZBT-1/ZBT-2, supervisor lifecycle, ingress UI for port 8080). The HA Matter integration will work identically with the upstream image, as long as the REST API on port 8081 is reachable from HA.
- The HA OTBR add-on is at https://github.com/home-assistant/addons/tree/master/openthread_border_router (HA OS / Supervised only — cannot be installed on a plain Docker / k3s deployment).
- The HA Matter Server add-on is *also* HA OS / Supervised only. On k3s you replace it with the standalone `ghcr.io/home-assistant-libs/python-matter-server:stable` (or `ghcr.io/matter-js/matterjs-server:stable`) container.

**TL;DR:** OTBR + Matter Server (as standalone containers) ↔ HA Matter integration. Skip both HA add-ons. They do the same job; the only differences are (a) HA add-ons have an ingress UI in HA's sidebar and (b) HA add-ons auto-handle ZBT-1/ZBT-2 firmware reflash.

---

## 8. Kubernetes ecosystem status (Helm charts, operators)

Searched: **k8s-at-home/charts**, **truecharts/charts**, **trueforge-org/truecharts**, GitHub code search for `openthread/border-router` + kubernetes/k3s/helm.

### Findings as of 2026-09-29

- **No first-party Kubernetes operator** exists for OTBR.
- **No first-party Helm chart** in the openthread/ot-br-posix repo.
- **No community Helm chart found** in k8s-at-home/charts (the repo is also being deprecated per their current README).
- **No community chart found** in truecharts or trueforge.
- **No k3s-specific deployment guide** is published.

### Why

OTBR is intentionally simple (a single daemon) and is almost universally run with `docker run`. Community write-ups target Docker Compose, Podman, HA OS, or Raspberry Pi OS — not Kubernetes. The few existing references are:

- A community docker-compose (https://github.com/openthread/openthread/discussions/13290) that uses `network_mode: host` and works on any host — this is the de-facto baseline.
- GitHub Discussions #13290, #12682, #11983, #10311 — informal docker troubleshooting, but useful as deployment evidence.

### Implication for the k3s deployment

You will need to **author your own manifests** (this research report is the input). The k3s manifests will look very similar to docker-compose but use:

- A **DaemonSet** (one OTBR pod per node that has a radio attached — driven by Akri or by nodeSelector on a serial-port label)
- `hostNetwork: true`, `dnsPolicy: ClusterFirstWithHostNet`
- `securityContext.capabilities.add: [NET_ADMIN]` (consider `IPC_LOCK` too)
- hostPath volumes for `/data` and `/dev/ttyACM0`, `/dev/net/tun`
- Akri for USB discovery — same pattern as the existing `apps/zigbee2mqtt` (which uses an Akri `Configuration` with `udevRules` matching `idVendor=10c4 idProduct=ea60` for CP210x). For OTBR you would use a different udev rule (e.g. `idVendor=10c4 idProduct=ea60` if reusing CP210x, or `idVendor=239a`/`idVendor=0451` for the various 802.15.4 sticks).
- A **Service** (or none — hostNetwork makes Services mostly cosmetic; you can use `ExternalName`/`headless` to give HA a stable DNS name inside the cluster).
- A **Matter Server pod + Service** (separate deployment, no special privileges — just WebSocket port 5580).

---

## 9. SPI/network access vs. serial RCP — homelab verification

**Confirmed:** OTBR does **not** require SPI access to a specific on-board radio. The only host requirements are:

1. A USB-attached serial device exposing `/dev/ttyACM0` (or `ttyACM<n>`, `ttyUSB<n>`).
2. The Linux kernel `tun` module (`/dev/net/tun` exists on every modern distro).

The OTBR daemon communicates with the radio over **HDLC-framed Spinel** (the `spinel+hdlc+uart://` URL), which is a serial protocol that runs over USB-CDC at 1 Mbaud (or whatever baud you set). The whole stack runs in userspace.

This means **the simplest homelab setup** is:

1. Buy a Home Assistant Connect ZBT-2 (or any 802.15.4 USB stick with OTBR-compatible RCP firmware).
2. Flash it to RCP firmware (ZBT-1/ZBT-2: one CLI command with `universal-silabs-flasher`; or HA's OTBR add-on will do it for you if you have HA OS — *not* needed in k3s).
3. Plug it into the k3s node's USB port.
4. Label the node or use Akri to bind the OTBR pod to that node.
5. Run the OTBR pod with `hostNetwork: true`, `NET_ADMIN`, and `--device=/dev/ttyACM0:/dev/ttyACM0`.

No SPI, no GPIO, no special kernel modules, no real-time scheduling, no additional network interfaces beyond the existing infra interface (eth0 on the cluster node).

**Edge case:** If your radio is on a *remote* node (e.g. via USB over IP or an SLZB-MR2 Ethernet-to-Thread bridge), you can use the `spinel+uart-tcp://<host>:<port>` or `spinel+udp://...` URL formats instead of the default `spinel+hdlc+uart`. This lets the OTBR pod run on a different node than the radio. The official docker doc only covers the default, but the Spinel driver supports several transports — see https://github.com/openthread/openthread/tree/main/src/lib/spinel (community discussions confirm: https://github.com/openthread/openthread/discussions/11954 about SLZB-MR2).

---

## Appendix A — Suggested k3s manifest sketch

The author of this report did not write a manifest, but a k3s-style sketch follows for reference. Marc should write the actual `apps/otbr/resources/{deployment,service,...}.yaml` files and an `applications/apps/otbr.yaml` Argo CD Application.

```yaml
# apps/otbr/resources/daemonset.yaml (sketch)
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: otbr
  namespace: otbr
spec:
  selector:
    matchLabels: { app: otbr }
  template:
    metadata:
      labels: { app: otbr }
    spec:
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      nodeSelector:
        openthread/enabled: "true"      # taint+label the node(s) with the radio
      tolerations:
        - key: openthread
          operator: Equal
          value: "true"
          effect: NoSchedule
      containers:
        - name: otbr
          image: openthread/border-router:2026.09.0
          env:
            - name: OT_RCP_DEVICE
              value: "spinel+hdlc+uart:///dev/ttyACM0?uart-baudrate=1000000"
            - name: OT_INFRA_IF
              value: "eth0"              # ← adjust to your node's LAN iface
            - name: OT_THREAD_IF
              value: "wpan0"
            - name: OT_LOG_LEVEL
              value: "5"
            - name: OT_WEB_LISTEN_ADDR
              value: "0.0.0.0"           # so HA / browser can reach it
            - name: OT_REST_LISTEN_ADDR
              value: "0.0.0.0"
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
          securityContext:
            capabilities:
              add: ["NET_ADMIN"]        # avoid privileged if possible
            # privileged: true          # only if NET_ADMIN isn't enough
          volumeMounts:
            - name: data
              mountPath: /data
            - name: tun
              mountPath: /dev/net/tun
            - name: serial
              mountPath: /dev/ttyACM0
      volumes:
        - name: data
          hostPath:
            path: /var/lib/otbr
            type: DirectoryOrCreate
        - name: tun
          hostPath:
            path: /dev/net/tun
        - name: serial
          hostPath:
            path: /dev/ttyACM0
            type: CharDevice
```

(For Akri-based binding instead of nodeSelector, see the existing pattern in `infra/akri/resources/zigbee-usb.yaml` and add a new `Configuration` with the appropriate `udevRules` for your radio's vendor/product IDs.)

---

## Sources (all verified 2026-09-29)

- OpenThread Border Router repo: https://github.com/openthread/ot-br-posix
- Official install guide: https://openthread.io/guides/border-router/docker
- Official prepare guide: https://openthread.io/guides/border-router/prepare
- Docker Hub: https://hub.docker.com/r/openthread/border-router
- Releases: https://github.com/openthread/ot-br-posix/releases/tag/v2026.09.0
- Dockerfile: https://github.com/openthread/ot-br-posix/blob/main/etc/docker/border-router/Dockerfile
- otbr-env defaults: https://github.com/openthread/ot-br-posix/blob/main/etc/docker/border-router/otbr-env.list
- Host setup helper: https://github.com/openthread/ot-br-posix/blob/main/etc/docker/border-router/setup-host
- s6 otbr-agent run: https://github.com/openthread/ot-br-posix/blob/main/etc/docker/border-router/rootfs/etc/s6-overlay/s6-rc.d/otbr-agent/run
- s6 otbr-web run: https://github.com/openthread/ot-br-posix/blob/main/etc/docker/border-router/rootfs/etc/s6-overlay/s6-rc.d/otbr-web/run
- HA Matter integration: https://www.home-assistant.io/integrations/matter/
- HA Thread integration: https://www.home-assistant.io/integrations/thread/
- HA OTBR add-on (config.yaml): https://github.com/home-assistant/addons/blob/master/openthread_border_router/config.yaml
- HA Matter Server add-on (Docker image): https://hub.docker.com/r/homeassistant/amd64-addon-matter-server
- python-matter-server (deprecated, last version): https://github.com/home-assistant-libs/python-matter-server
- matterjs-server (new JS implementation): https://github.com/matter-js/matterjs-server
- Community docker-compose example (working baseline): https://github.com/openthread/openthread/discussions/13290