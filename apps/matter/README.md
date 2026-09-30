# Matter Server

Open Home Foundation Matter controller for Home Assistant.

## Overview

[Matter](https://csa-iot.org/all-solutions/matter/) is a smart-home protocol
that runs over Thread, Wi-Fi, or Ethernet. Home Assistant's bundled Matter
component needs an external **Matter controller** (a.k.a. Matter Server) that
does the heavy lifting: commissioning, fabric management, device attestation,
OTA. This repo runs that controller as a standalone container in the cluster.

Pair this with the OTBR pod in `apps/openthread/` for Matter-over-Thread
devices (IKEA TIMMERFLOTTE, Eve, Nanoleaf, etc.). Matter-over-Wi-Fi devices
work without OTBR.

## Architecture

```
┌──────────────────────┐
│  Home Assistant      │   bundled Matter component (matter-python-client)
└──────────┬───────────┘
           │ WebSocket, ws://matter-server.matter.svc:5580/ws
           ▼
┌──────────────────────┐
│  Matter Server       │   this repo, ghcr.io/home-assistant-libs/python-matter-server
│  (this deployment)   │
└──────────┬───────────┘
           │ UDP/IPv6, port 5540
           ▼
┌──────────────────────┐
│  OTBR pod (openthread ns)  │  Thread↔LAN bridge
└──────────┬───────────┘
           │ 802.15.4 Thread
           ▼
┌──────────────────────┐
│  TIMMERFLOTTE / Eve / etc.  │ Matter-over-Thread devices
└──────────────────────┘
```

## Configuration

- Headless Service on port 5580 (HA connects via DNS)
- PVC-backed `/data` for fabric state (commissioning credentials, device list)
- Image pinned to `:stable` (tracks 6.2.x) — pin to a digest in production
- 1 replica with `Recreate` strategy (stateful fabric)
- `readOnlyRootFilesystem: true` + dropped capabilities + non-root UID
- No mTLS (matches the cluster's general posture — no secrets in git)

## Links

- WebSocket URL (for HA Matter config): `ws://matter-server.matter.svc:5580/ws`
- HA Matter docs: https://www.home-assistant.io/integrations/matter/
- Matter Server upstream: https://github.com/home-assistant-libs/python-matter-server
- Namespace: `matter`

## Setup (HA side, after this deploys)

1. **Settings → Devices & Services → Add Integration → Matter**
2. HA scans the cluster for `_matter._tcp.local.` (mDNS/zeroconf) and
   discovers this server automatically. If not, click "Manual setup" and
   enter `ws://matter-server.matter.svc:5580/ws`.
3. **Settings → Devices & Services → Thread** — HA should auto-discover the
   OTBR at `hp-elitedesk` via `_meshcop._udp.local.` mDNS. Click Configure
   to import the Thread dataset. Confirm the network name matches what
   OTBR reports (`Home` by default).
4. **Settings → Devices & Services → Matter → Add Device** — scan the
   Matter QR code on the TIMMERFLOTTE (or any Matter-over-Thread device).
5. (Optional) Install the **Home Assistant Companion app** on your phone.
   Share the Thread credentials to the app so your phone can also
   commission Matter-over-Thread devices locally.