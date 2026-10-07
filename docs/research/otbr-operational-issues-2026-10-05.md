# OTBR Operational Issues — Investigation Notes (2026-10-05, revised 2026-10-07)

Investigation of the OTBR pod crash loop and the failing Matter OTA update
of the IKEA ALPSTUGA (Matter node 10). The first version of this document
(2026-10-05) contained several theses that turned out to be wrong when checked
against cluster state and logs on 2026-10-07. They are listed under
[Withdrawn theses](#withdrawn-theses) so nobody re-investigates them.

## Symptoms

- `otbr-agent` exits with code 6 roughly every few minutes to ~1.5 h
  (249 restarts in 7 days as of 2026-10-07). Each crash looks the same:

  ```
  [W] P-RadioSpinel-: radio tx timeout
  [C] P-RadioSpinel-: Failed to communicate with RCP - no response from RCP during initialization
  [C] Platform------: HandleRcpTimeout() at radio_spinel.cpp:2054: RadioSpinelNoResponse
  otbr-agent exited with code 6 (by signal 0).
  ```

- The Matter OTA update of node 10 (`1.0.13` → `1.0.26`, 515,793 byte image
  from `ota.matter.ikea.com`) never completes. Matter Server reports
  `Target node did not process the update file`.

## Confirmed findings

### The crash happens at runtime, while the RCP is in active use

The container that died at 17:45 UTC on 2026-10-07 had been running for
20 minutes, with normal Spinel RX traffic until 1.2 s before `radio tx timeout`.
The text "during initialization" is only the generic wording of
`HandleRcpTimeout()`. It does not mean the crash happens at startup. The RCP stops
answering in the middle of normal operation.

### Heavy Spinel traffic triggers the crash, and that is why OTA fails

The OTA itself works up to the transfer: Matter Server downloads the image to
`/data/updates/10`, commissions the OTA provider app, the device sends
`QueryImage` and starts a BDX download (≈2–3 blocks/s). Every BDX transfer
stopped exactly when OTBR crashed (crash time = host `dmesg` line
`wpan0: left allmulticast mode`):

| Attempt (UTC)    | BDX blocks | Last block | OTBR crash |
|------------------|-----------:|------------|------------|
| 2026-10-02 05:42 | 322        | 05:45:08   | 05:45:09   |
| 2026-10-02 07:17 | 294        | 07:20:53   | 07:20:54   |
| 2026-10-03 17:55 | 355        | 17:56:34   | 17:56:35   |
| 2026-10-05 06:46 | 72         | 06:49:15   | 06:49:17   |

During OTA transfers OTBR crashes every 20–90 s (e.g. 6 crashes between
07:17 and 07:22 on 2026-10-02), compared to minutes to hours otherwise. After a
crash all Thread nodes (7, 8, 10) drop out together and resubscribe 1–2 min
later. The provider's BDX session cannot survive that and times out
(`Msg Retransmission ... failure (max retries:8)` → `BDX: Transfer timed out`).

### Hardware and link

- The RCP is a Sonoff ZBDongle-E V2 ("Sonoff Zigbee 3.0 USB Dongle Plus V2",
  CP2102N `10c4:ea60`) on `/dev/ttyUSB1`. It runs freshly flashed OpenThread
  RCP firmware (`SL-OPENTHREAD/3.1.1.0_GitHub-fb274efe6; EFR32`) at 921600 baud.
- Until 2026-10-07 the RCP URL had **no `uart-flow-control`**, so the host
  sent bursts at 921600 baud without RTS/CTS.
- USB is stable: no disconnect or re-enumeration events in the kernel log.
  USB autosuspend is **not** active for the dongle (`power/control=on`).
- CPU throttling of the OTBR container is negligible (9 throttle events,
  0.7 s total in 27 min at the 200m limit). It does not explain the crash.

### The Thread network itself is stable across crashes

On every restart otbr-agent restores the stored dataset (same network key,
PAN ID, ext PAN ID `93f4552d137d2206`, channel 25). It goes
`detached -> router` within ~0.5 s and rejoins the existing partition.
Devices reattach on their own. Border Agent state is `Active`, and SRP and
the DNS-SD server are running.

## Current experiment (2026-10-07)

`uart-flow-control` was added to `OT_RCP_DEVICE`
(`apps/openthread/resources/deployment.yaml`) to enable RTS/CTS. Hypothesis:
the RCP's UART RX overruns under burst load and the Spinel stream
desynchronizes. Success criteria: otbr-agent survives sustained traffic (a full
OTA transfer of ~500 blocks) without `radio tx timeout`. If the RCP firmware
does not drive CTS, otbr-agent fails to talk to the RCP at all right after
startup. In that case, revert.

## Open questions

- **2026-10-07 18:00 UTC attempt failed before the transfer started.** The
  device sent two SRV/TXT queries for the provider
  (`9CD01C73A748520C-00000000000F1B3A._matter._tcp.default.service.arpa.`) to
  the BR's DNS-SD server. Both responses went out exactly 6.000 s later,
  which is the discovery-proxy timeout. So the device never learned the
  provider's address, and it went back to `kIdle` after 12 s. The provider
  advertised the record on `eno1`, and earlier attempts got past this step.
  Retest once OTBR is stable.
- `OT_LOG_LEVEL` is still `7` (debug) for diagnosis. Set it back to `5`
  once the RCP link is stable.

## Withdrawn theses

These statements from the 2026-10-05 version were checked and are wrong.

- *"The crash happens at 16s exactly into startup (Spinel INIT timeout)."*
  Wrong. Containers run for minutes before crashing; see above.
- *"Every pod restart forms a new Thread network with a new network key, PAN
  ID, mesh-local prefix and channel; devices are orphaned."* Wrong. The
  dataset is persisted and restored, and devices reattach.
- *"`auto-attach=0` image default prevents attaching / Border Agent state is
  empty (`baState: \"\"`)."* Wrong. The agent attaches automatically and
  `ba state` is `Active`. The referenced `otbr-agent-run-override.yaml` does
  not exist in the repo, and `otbr-k8s-deployment.md` does not document an
  auto-attach issue.
- *"All devices have discriminator 112233, so the attribute cache is a placeholder."*
  Wrong. 112233 (`0x1B669`) is the node ID of the Matter Server controller
  itself, not a device discriminator.
- *"HA Matter integration shows 0/0 nodes."* Outdated. Nodes 7, 8, 10 and 11 are
  commissioned and subscribed.
- *"USB enumeration race after cgroup teardown"* and *"USB autosuspend"* as crash
  causes: not supported by evidence. No USB events, and autosuspend is off for
  the dongle.
- The preStop hook, startup probe and grace-period changes were rightly
  reverted. They don't address a runtime RCP timeout.
