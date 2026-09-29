# OpenThread Border Router (OTBR) Implementation Plan

> **For Hermes:** Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Deploy the upstream `openthread/border-router` Docker image on the
SP0Fs k3s cluster, hosted on the `hp-elitedesk` node, using the existing
ZBDongle-E (EFR32MG21) flashed with Thread RCP firmware. Expose the OTBR Web
GUI via Ingress with mTLS, and expose the OTBR REST API + mDNS ports on the
host network so Home Assistant's Matter integration can auto-discover it.

**Architecture:** One OTBR pod on `hp-elitedesk`, `hostNetwork: true`,
`NET_ADMIN` capability, `/dev/net/tun` + `/dev/ttyUSB1` mounted in. The pod
runs the upstream `openthread/border-router:2026.09.0` image with the standard
`otbr-env` overrides (`OT_INFRA_IF=eno1`, `OT_THREAD_IF=wpan0`, both REST/Web
listeners on `0.0.0.0`). The radio stick is bound to the pod exclusively via
an Akri `Configuration` matching the E dongle's serial (the two Sonoff
dongles share VID/PID `10c4:ea60` and must be distinguished by serial).

**Tech Stack:** k3s v1.36.3+k3s1, ArgoCD app-of-apps, Akri v0.13.8 (existing),
SealedSecrets (existing), `openthread/border-router:2026.09.0` (CalVer-pinned),
Ubuntu 24.04 sysctl + netplan drop-in on `hp-elitedesk`.

**Pre-research:** See [docs/research/otbr-k8s-deployment.md](../research/otbr-k8s-deployment.md)
for the full investigation that informed this plan (image, capabilities,
ports, NetworkManager caveats, HA Matter integration path).

**Hardware facts (verified on `hp-elitedesk`, 2026-09-29):**

| Device | Path | Product | Serial | Role |
|------|------|---------|--------|------|
| ZBDongle-P | `/dev/ttyUSB0` | "Sonoff Zigbee 3.0 USB Dongle Plus" | `6ea5312e...` | Zigbee2MQTT (existing) |
| ZBDongle-E | `/dev/ttyUSB1` | "Sonoff Zigbee 3.0 USB Dongle Plus V2" | `96632739...` | **OTBR (new)** |

Both on `Bus 003` of `hp-elitedesk`. Infra iface is `eno1` (not `eth0`).

---

## Task 1: Prepare host on hp-elitedesk (sysctl + netplan)

**Objective:** Enable IPv4/IPv6 forwarding on `hp-elitedesk` and tell
systemd-networkd to leave the `wpan0`/`trel*`/`lowpan*` interfaces alone and
accept Router Advertisements on `eno1`. Run this ONCE per node; it's a
host-level requirement, not a k8s resource.

> **Note:** `hp-elitedesk` runs `netplan → systemd-networkd` (Ubuntu Server
> 24.04 default renderer), not NetworkManager. The plan originally had NM
> config; ignore those steps and use the netplan drop-in below.

**Files on host (not in git):**
- `/etc/sysctl.d/60-otbr.conf` (new)
- `/etc/netplan/99-otbr.yaml` (new — drop-in, lower filename sorts later)

Persistent state (Thread dataset, Border Agent ID) lives on a `PersistentVolumeClaim`
bound to the `ssd` storageclass (your NFS provisioner) — matches the pattern
used by Zigbee2MQTT (`apps/zigbee2mqtt/resources/pvc.yaml`). No host directory
needed.

**Step 1: Write the sysctl file**

Run on `hp-elitedesk`:
```bash
ssh hp 'cat > /tmp/60-otbr.conf <<EOF
net.ipv6.conf.all.forwarding = 1
net.ipv4.ip_forward = 1
EOF
cat /tmp/60-otbr.conf'
```

Then `sudo` (single paste, password once):
```bash
sudo cp /tmp/60-otbr.conf /etc/sysctl.d/60-otbr.conf
sudo sysctl -p /etc/sysctl.d/60-otbr.conf
```

Verify:
```bash
ssh hp 'sysctl net.ipv6.conf.all.forwarding net.ipv4.ip_forward'
```
Expected:
```
net.ipv6.conf.all.forwarding = 1
net.ipv4.ip_forward = 1
```

**Step 2: Netplan drop-in to set `accept-ra` on `eno1`**

The default netplan file (`/etc/netplan/00-installer-config.yaml`) sets
`dhcp4: true` with no `accept-ra` directive. Add a drop-in that augments
`eno1` without rewriting the base file (so cloud-init or subiquity
regenerations don't conflict):

```bash
ssh hp 'cat > /tmp/99-otbr.yaml <<EOF
network:
  version: 2
  renderer: networkd
  ethernets:
    eno1:
      accept-ra: true
EOF
cat /tmp/99-otbr.yaml'
```

Then sudo:
```bash
sudo cp /tmp/99-otbr.yaml /etc/netplan/99-otbr.yaml
sudo chmod 600 /etc/netplan/99-otbr.yaml
sudo netplan generate
sudo netplan try   # auto-rolls-back after 120s if connectivity drops
```
Verify (after `netplan try` confirms, e.g. by hitting Enter to accept):
```bash
ssh hp 'networkctl status eno1 | grep -E "(Accept Router Advertisements|IPv6)"' 
ssh hp 'sysctl net.ipv6.conf.eno1.accept_ra net.ipv6.conf.eno1.accept_ra_rt_info_max_plen'
```
Expected:
```
net.ipv6.conf.eno1.accept_ra = 2
net.ipv6.conf.eno1.accept_ra_rt_info_max_plen = 64
```

**Step 3: Tell systemd-networkd to leave OTBR interfaces alone**

systemd-networkd only manages interfaces listed in `/etc/systemd/network/*.network`
or in netplan. Since the OTBR `wpan0` is created by the container at runtime
and never appears in netplan, networkd will ignore it by default — no extra
config needed. Skip this step on `hp-elitedesk`.

**Step 4: [removed]**

Persistent state is handled by the `openthread-data` PVC bound to the `ssd`
storageclass — no host directory needed. The PVC is created when the
openthread Application syncs.

**Step 5: Verify state**

```bash
ssh hp 'sudo networkctl status eno1 | head -20'
ssh hp 'ip -6 addr show eno1 | grep -E "(inet6|valid_lft)"'
ssh hp 'sudo journalctl --since "-2min" -u systemd-networkd | tail -10'
```
Expected: eno1 shows `State: routable`, an IPv6 address in the LAN prefix
(2003:e5:173c:d600:... / fdb0:4a0c:dccc:...), and no errors in networkd's
recent log.

**Step 6: Commit message**

No commit — these changes are host-level, not in git.

---

## Task 2: Add Akri Configuration for the E dongle

**Objective:** Add a second Akri `Configuration` so the E dongle can be
discovered by Akri and made available to the OTBR pod — same pattern as the
existing `akri-zigbee-usb` rule, but distinguishing the E dongle from the P
dongle (which has identical VID/PID).

**Files:**
- Create: `infra/akri/resources/openthread-usb.yaml`

**Step 1: Write the manifest**

```yaml
apiVersion: akri.sh/v0
kind: Configuration
metadata:
  name: akri-openthread-usb
spec:
  capacity: 1
  discoveryHandler:
    discoveryDetails: |
      groupRecursive: true
      udevRules:
      # ZBDongle-E (Silicon Labs EFR32MG21 flashed with OTBR RCP firmware).
      # VID/PID 10c4:ea60 is shared with the ZBDongle-P on Zigbee2MQTT (both
      # use a Silicon Labs CP210x USB-UART bridge), so we add the device's
      # unique serial to distinguish them. If this dongle is replaced,
      # update the serial — `udevadm info -a -n /dev/ttyUSB1 | grep serial`
      # on the new stick.
      - ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="ea60", ATTRS{serial}=="966327398678f011b9e1a6e70ba521c7"
    name: udev
```

Create it:
```bash
mkdir -p /home/mleibold/Projects/cluster/infra/akri/resources
```

(then write the file via the `write_file` tool)

**Step 2: Apply locally to test**

```bash
kubectl apply -f /home/mleibold/Projects/cluster/infra/akri/resources/openthread-usb.yaml
kubectl get akric -A
```

Expected: a second row `akri-openthread-usb` with `CAPACITY 1`, alongside the
existing `akri-zigbee-usb`. The Akri broker should also advertise a
`akri.sh/akri-openthread-usb=1` resource on the node where the E dongle is
attached (`hp-elitedesk`).

**Step 3: Commit**

```bash
git -C /home/mleibold/Projects/cluster add infra/akri/resources/openthread-usb.yaml
git -C /home/mleibold/Projects/cluster commit -m "feat(akri): add configuration for openthread usb"
```

---

## Task 3: Add the OTBR manifest set

**Objective:** Create the `apps/openthread/` app directory mirroring the
zigbee2mqtt layout (Deployment, Service, Ingress, optional NodePort).

**Files:**
- Create: `apps/openthread/resources/deployment.yaml`
- Create: `apps/openthread/resources/service.yaml`
- Create: `apps/openthread/resources/ingress.yaml`
- Create: `apps/openthread/README.md`
- Create: `apps/openthread/_namespace.yaml` (matches homeassistant pattern)

**Step 1: Namespace**

```yaml
# apps/openthread/_namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: openthread
```

**Step 2: Deployment**

```yaml
# apps/openthread/resources/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openthread-border-router
  namespace: openthread
  labels:
    app: openthread-border-router
spec:
  selector:
    matchLabels:
      app: openthread-border-router
  replicas: 1
  strategy:
    # Recreate is mandatory: the serial device is exclusive to one pod, and
    # the host's wpan0 interface cannot coexist across two replicas. Matches
    # the zigbee2mqtt pattern.
    type: Recreate
  template:
    metadata:
      labels:
        app: openthread-border-router
    spec:
      # Schedule on hp-elitedesk — that's where both USB dongles live.
      nodeSelector:
        kubernetes.io/hostname: hp-elitedesk
      # hostNetwork is REQUIRED by OTBR (s6 services bind to host's loopback,
      # mDNSResponder publishes to host's interfaces). dnsPolicy preserves
      # CoreDNS resolution so the pod can still resolve cluster service DNS.
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      containers:
        - name: otbr
          image: openthread/border-router:v2026.09.0
          imagePullPolicy: IfNotPresent
          resources:
            requests:
              # Akri resource — only schedule when the E dongle is present.
              # Mirrors the zigbee2mqtt pattern.
              akri.sh/akri-openthread-usb: "1"
              cpu: 50m
              memory: 64Mi
            limits:
              akri.sh/akri-openthread-usb: "1"
              cpu: 200m
              memory: 256Mi
          env:
            # RCP over the E dongle at /dev/ttyUSB1 (ZBDongle-E).
            - name: OT_RCP_DEVICE
              value: "spinel+hdlc+uart:///dev/ttyUSB1?uart-baudrate=1000000"
            # Infra interface on hp-elitedesk is eno1 (verified via `ip route`).
            # OTBR uses this for upstream IPv6 reachability to the LAN.
            - name: OT_INFRA_IF
              value: "eno1"
            # Default, but explicit so future readers don't have to check.
            - name: OT_THREAD_IF
              value: "wpan0"
            # 5 = notice (default is 7 = debug, way too chatty).
            - name: OT_LOG_LEVEL
              value: "5"
            # Both HTTP ports default-bind to 127.0.0.1; override so HA and
            # the browser can reach them. With hostNetwork=true, "0.0.0.0"
            # binds to all host interfaces.
            - name: OT_WEB_LISTEN_ADDR
              value: "0.0.0.0"
            - name: OT_REST_LISTEN_ADDR
              value: "0.0.0.0"
            # Use the modern nftables backend to avoid SYS_ADMIN requirement.
            # Added in OTBR 2026.09 (PR #3325).
            - name: OTBR_NFTABLES
              value: "1"
          ports:
            # Documentation only — hostNetwork makes these bind to the host's
            # interfaces directly. Service ports below match.
            - containerPort: 8080
              name: web
              protocol: TCP
            - containerPort: 8081
              name: rest
              protocol: TCP
            - containerPort: 19791
              name: meshcop
              protocol: UDP
          securityContext:
            # NOT privileged — NET_ADMIN is sufficient with OTBR_NFTABLES=1.
            capabilities:
              add:
                - NET_ADMIN
                # IPC_LOCK lets mDNSResponder mlock() its pages; matches HA
                # add-on's privilege list.
                - IPC_LOCK
          volumeMounts:
            # OTBR's persistent state (Thread dataset, Border Agent ID).
            - name: data
              mountPath: /data
            # TUN device — required for the wpan0 virtual interface.
            - name: tun
              mountPath: /dev/net/tun
            # The E dongle's serial device — hostPath so we don't depend on
            # Akri's broker doing device passthrough (Akri gives us scheduling,
            # not the device itself).
            - name: serial
              mountPath: /dev/ttyUSB1
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: openthread-data
        - name: tun
          hostPath:
            path: /dev/net/tun
            type: CharDevice
        - name: serial
          hostPath:
            path: /dev/ttyUSB1
            type: CharDevice
```

**Step 3: Service**

```yaml
# apps/openthread/resources/service.yaml
# Service is mostly cosmetic — hostNetwork=true means OTBR binds to the host's
# network namespace directly. We expose a Service for two reasons:
#   1. HA's Thread integration reaches OTBR at otbr-rest.openthread.svc:8081
#      (cleaner than hardcoding the node IP).
#   2. The Ingress below routes to this Service for the Web UI.
apiVersion: v1
kind: Service
metadata:
  name: openthread-border-router
  namespace: openthread
  labels:
    app: openthread-border-router
spec:
  # ClusterIP is fine — pod's network namespace == host's, so the Service IP
  # won't actually be hit. Use ExternalName-style headless instead? No: we
  # want the cluster DNS to resolve this name for HA and the Ingress.
  clusterIP: None
  selector:
    app: openthread-border-router
  ports:
    - name: web
      port: 8080
      targetPort: 8080
    - name: rest
      port: 8081
      targetPort: 8081
```

**Step 4: Ingress**

```yaml
# apps/openthread/resources/ingress.yaml
# OTBR Web UI on otbr.leibold.tech, same mTLS pattern as homeassistant and
# zigbee2mqtt. Marc already has ca-issuer and spof-cert set up.
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: openthread-border-router
  namespace: openthread
  annotations:
    cert-manager.io/cluster-issuer: ca-issuer
    nginx.ingress.kubernetes.io/backend-protocol: HTTP
    nginx.ingress.kubernetes.io/auth-tls-verify-client: "on"
    nginx.ingress.kubernetes.io/auth-tls-secret: "openthread/spof-cert"
    nginx.ingress.kubernetes.io/auth-tls-verify-depth: "1"
    nginx.ingress.kubernetes.io/auth-tls-error-page: "https://insult.mattbas.org/api/insult.html"
    nginx.ingress.kubernetes.io/auth-tls-pass-certificate-to-upstream: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - otbr.leibold.tech
      secretName: otbr-certs
  rules:
    - host: otbr.leibold.tech
      http:
        paths:
          - pathType: Prefix
            path: /
            backend:
              service:
                name: openthread-border-router
                port:
                  number: 8080
```

**Step 5: README**

```markdown
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
- Thread dataset persisted on the `openthread-data` PVC (`ssd` storageclass,
  NFS-backed — same pattern as Zigbee2MQTT).
- Akri `akri-openthread-usb` resource bound to the E dongle (capacity 1).

## Links

- Web UI: https://otbr.leibold.tech (mTLS)
- REST API (HA Matter integration target): http://hp-elitedesk:8081
- Border Agent mDNS: `_meshcop._udp` on the LAN (port 19791)
- Namespace: `openthread`

## Host prerequisites (planned, not yet applied)

These are configured on `hp-elitedesk` outside of GitOps:

- `/etc/sysctl.d/60-otbr.conf` — IPv4 + IPv6 forwarding enabled
- `/etc/netplan/99-otbr.yaml` — `accept-ra: true` on `eno1`

Persistent Thread state lives on the `openthread-data` PVC (NFS via `ssd`
storageclass), so no host directory is needed.

See `docs/plans/2026-09-29-openthread-border-router.md` for the host-setup
commands.

## Research

See `docs/research/otbr-k8s-deployment.md` for the full design investigation.
```

**Step 6: Apply locally to validate before committing**

```bash
kubectl apply -f /home/mleibold/Projects/cluster/apps/openthread/_namespace.yaml
kubectl apply -f /home/mleibold/Projects/cluster/apps/openthread/resources/

# Wait for Akri to discover the dongle and schedule the pod
kubectl -n openthread get pods -w
```

Expected: pod lands on `hp-elitedesk`, transitions to `Running`. Inspect:

```bash
kubectl -n openthread logs deployment/openthread-border-router --tail=50
```

Expected log line: `otbr-agent: Border router is up` (or similar — the exact
log message depends on the version).

Smoke-test the REST API from the host:
```bash
ssh hp 'curl -s http://localhost:8081/node/dataset/active | jq .'
```
Expected: a JSON object with the Thread dataset (may be a default/empty
dataset on first boot — that's fine).

Smoke-test the Web UI from outside the cluster:
```bash
curl -k --cert ~/.kube/spof-cert.pem --key ~/.kube/spof-cert.key https://otbr.leibold.tech/
```
Expected: HTML response showing the OTBR web interface.

**Step 7: Commit**

```bash
git -C /home/mleibold/Projects/cluster add apps/openthread/
git -C /home/mleibold/Projects/cluster commit -m "feat(openthread): add otbr deployment"
```

---

## Task 4: Wire up the ArgoCD Application

**Objective:** Add the ArgoCD Application manifest so the `openthread`
namespace and resources are managed by GitOps. Akri will pick up the new
`Configuration` automatically (it watches the whole cluster).

**Files:**
- Create: `applications/apps/openthread.yaml`

**Step 1: Write the manifest**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: openthread
  namespace: argo-cd
spec:
  project: spof-cluster
  source:
    repoURL: "https://github.com/SP0Fs/cluster.git"
    targetRevision: main
    path: apps/openthread
    # ArgoCD pulls every .yaml under apps/openthread (matches homeassistant
    # pattern).
    directory:
      recurse: true
      include: "*.yaml"
  destination:
    server: "https://kubernetes.default.svc"
    namespace: openthread
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

**Step 2: Apply and verify**

```bash
kubectl apply -f /home/mleibold/Projects/cluster/applications/apps/openthread.yaml
argocd app list 2>/dev/null || kubectl -n argo-cd get application openthread
```

Expected: the new `openthread` application appears, status `Synced` or
`OutOfSync` reconciling.

**Step 3: Commit**

```bash
git -C /home/mleibold/Projects/cluster add applications/apps/openthread.yaml
git -C /home/mleibold/Projects/cluster commit -m "feat(argo): add openthread application"
```

---

## Task 5: End-to-end verification

**Objective:** Confirm OTBR is actually serving a Thread network and that HA
(or a hand-rolled client) can see the REST API.

**Step 1: Confirm the wpan0 interface exists on hp-elitedesk**

```bash
ssh hp 'ip -6 addr show dev wpan0 2>/dev/null || echo "wpan0 NOT FOUND"'
```

Expected: shows a link-local IPv6 address (`fe80::...`) on the `wpan0`
interface. **Not found** means the OTBR pod failed to start — check pod logs.

**Step 2: Confirm Border Agent is publishing mDNS**

```bash
ssh hp 'sudo avahi-browse -rt _meshcop._udp 2>&1 | head -20'
```

Expected: a `_meshcop._udp` service record appears with a name like
`OpenThread BorderRouter` and the LAN address of `hp-elitedesk` (192.168.178.99).
**Not seen** means `avahi-daemon` or the OTBR Border Agent hasn't started —
check pod logs.

**Step 3: Commission a Thread device (optional but recommended)**

If you have a Thread-compatible device (or a phone with the HA Companion
app), pair it via the OTBR web UI and confirm the device appears as a Thread
child on the topology map.

---

## Pitfalls

### `privileged: true` is NOT needed

Despite many community docker-compose examples using `privileged: true`, the
upstream OTBR image only requires `NET_ADMIN` (+ `IPC_LOCK` for mDNSResponder)
when `OTBR_NFTABLES=1` is set (the modern backend, default since OTBR
2026.09). `SYS_ADMIN` is only needed for the legacy ipset backend — avoid it
unless you have a specific reason.

### Both HTTP ports default-bind to `127.0.0.1`

OTBR's s6 services bind to the loopback by default. Because the container
uses `hostNetwork`, "loopback" = the host's loopback, which works for HA on
the same node but breaks Ingress routing (Ingress sees the pod via its
cluster IP, which isn't `127.0.0.1`). **Always set `OT_WEB_LISTEN_ADDR=0.0.0.0`
and `OT_REST_LISTEN_ADDR=0.0.0.0`** — both manifest env entries are critical.

### NetworkManager vs. systemd-networkd

The research assumed NetworkManager (which is the default on Ubuntu Desktop
and on HA OS / Raspbian). `hp-elitedesk` runs `netplan → systemd-networkd`
instead (Ubuntu Server default). On networkd, the equivalent of NM's
`unmanaged-devices` is "don't list the interface in netplan" — `wpan0`
created at runtime by OTBR is already un-managed by default, no config
needed. The `accept_ra=2` equivalent is netplan's `accept-ra: true` on the
interface.

### The original plan's NM dispatcher won't run on `hp`

### The two Sonoff dongles share VID/PID

The Akri Configuration for the E dongle **must** key on the device serial
(`ATTRS{serial}="966327398678f011b9e1a6e70ba521c7"`), not the VID/PID alone.
Otherwise both Zigbee2MQTT and OTBR pods will try to claim the same hardware
and one will fail to schedule. If the E dongle is ever replaced, update the
serial with `udevadm info -a -n /dev/ttyUSB1 | grep serial` on the new stick.

### `hostNetwork: true` skips `kube-flannel`

Because the OTBR pod lives in the host's network namespace, it cannot be
reached via cluster IPs — only via the host's actual IP. The Ingress routes
to the pod's `Service`, which is headless (`clusterIP: None`) and used only
for DNS resolution and label selection. This is intentional and matches how
the OTBR upstream docs describe the deployment.

### Akri provides scheduling, not the device

The `akri.sh/akri-openthread-usb` extended resource tells Akri to schedule
the pod on a node where the E dongle is detected, but the pod itself mounts
the device via `hostPath: /dev/ttyUSB1`. The combination is belt-and-braces:
if the device is unplugged, Akri stops scheduling the pod; if Akri is
misconfigured, the pod still gets the device (assuming the path exists).

### The OTBR dataset persists across pod restarts

The Thread network credentials (Border Agent ID, Active Operational Dataset)
live in the `openthread-data` PVC. Pod restarts do not lose the network;
node loss is recoverable as long as the NFS server survives (provisioner
runs on `hp-elitedesk`, so both die together — a known limitation).

### Don't enable IPv6 in k3s Flannel

The cluster uses Flannel (CNI default for k3s) and currently runs on IPv4
only. If you ever enable IPv6 in Flannel, OTBR's `ip6tables` rules will
interact with Flannel's. Stay on IPv4-only Flannel for now.

### Single replica, `strategy: Recreate`

The serial device is exclusive to one pod; two replicas cannot both hold the
radio. Use `strategy: Recreate` (matches zigbee2mqtt) so a rolling update
doesn't try to spin up a second pod before tearing down the first.

---

## Verification checklist

After all tasks complete, confirm:

- [ ] `kubectl -n openthread get pods` shows 1/1 Running on hp-elitedesk
- [ ] `kubectl -n openthread get ingress` shows `otbr.leibold.tech` with a cert
- [ ] `ssh hp 'ip -6 addr show dev wpan0'` shows an IPv6 link-local
- [ ] `ssh hp 'curl -s http://localhost:8081/node/dataset/active'` returns JSON
- [ ] `ssh hp 'avahi-browse -rt _meshcop._udp'` shows the Border Agent
- [ ] `curl -k --cert ... https://otbr.leibold.tech/` renders the OTBR Web UI
- [ ] `kubectl -n argo-cd get application openthread` is `Synced` + `Healthy`
- [ ] `git log --oneline` shows the three commits from tasks 2-4

## Out of scope

- Home Assistant Matter Server / Matter integration configuration (Marc's call)
- Matter device commissioning
- Backup of the OTBR Thread dataset (NFS already provides HA-ish; snapshots
  are overkill for a homelab)
- TLS certificate for the OTBR REST API (HA trusts it over plain HTTP for
  in-cluster connections)