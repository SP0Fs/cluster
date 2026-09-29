# OpenThread Border Router

OpenThread Border Router for Matter / Thread support.

## Overview

[OpenThread Border Router](https://openthread.io/guides/border-router) bridges
a Thread mesh network to an IPv6 network (Ethernet / Wi-Fi). With the OTBR pod
running on the cluster, Home Assistant's Matter integration can commission
Matter-over-Thread devices and Home Assistant can act as the Thread
credentials authority.

## Hardware

- **Radio:** Sonoff ZBDongle-E (Silicon Labs EFR32MG21, VID/PID `10c4:ea60`,
  product `"Sonoff Zigbee 3.0 USB Dongle Plus V2"`) flashed with OpenThread
  RCP firmware. Appears at `/dev/ttyUSB1` on `hp-elitedesk`.
- **Infra interface:** `eno1` on `hp-elitedesk` (the node's LAN NIC).

The ZBDongle-P at `/dev/ttyUSB0` continues to serve Zigbee2MQTT. The two
dongles share the same VID/PID (CP210x USB-UART bridge) and are
distinguished by **device serial** (`ATTRS{serial}`) in the Akri udev rule.

## Configuration

- Host network + NET_ADMIN capability (no privileged mode).
- Thread dataset persisted on the `openthread-data` PVC (NFS, `ssd`
  storageclass — same pattern as Zigbee2MQTT).
- Akri `akri-openthread-usb` resource bound to the E dongle (capacity 1).

## Links

- Web UI: https://otbr.leibold.tech (mTLS)
- REST API (HA Matter integration target): http://hp-elitedesk:8081
- Border Agent mDNS: `_meshcop._udp` on the LAN (port 19791)
- Namespace: `openthread`

## Host prerequisites

These are configured on `hp-elitedesk` outside of GitOps:

- `/etc/sysctl.d/60-otbr.conf` — IPv4 + IPv6 forwarding enabled
- `/etc/netplan/99-otbr.yaml` — `accept-ra: true` on `eno1`

Persistent Thread state lives on the `openthread-data` PVC (NFS via `ssd`
storageclass), so no host directory is needed.

See `docs/plans/2026-09-29-openthread-border-router.md` for the host-setup
commands.

## Research

See `docs/research/otbr-k8s-deployment.md` for the full design investigation.