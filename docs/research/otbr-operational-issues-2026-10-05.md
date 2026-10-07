# OTBR Operational Issues — Investigation Notes (2026-10-05, revised 2026-10-07)

> **Status 2026-10-07:** Root cause narrowed down to the ZBDongle-E RCP link
> (dongle side). Firmware/baud, USB port and flow control were tested without
> success. Next step: replace the Thread adapter. See [Conclusion](#conclusion-2026-10-07).

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
- The RCP link runs at 921600 baud **without RTS/CTS flow control**. Enabling
  it breaks RCP init with the current firmware; see the experiment below.
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

## Experiment: UART flow control (2026-10-07) — failed, reverted

Hypothesis: the RCP's UART RX overruns under burst load and the Spinel stream
desynchronizes. To test it, `&uart-flow-control` was added to `OT_RCP_DEVICE`.
The host side applied it (`stty` showed `crtscts` on `/dev/ttyUSB1`), but
otbr-agent then failed on every start before talking to the RCP:

```
[NOTE]-AGENT---: Radio URL: spinel+hdlc+uart:///dev/ttyUSB1?uart-baudrate=921600&uart-flow-control
00:00:00.000 [C] Platform------: Init() at spinel_driver.cpp:87: Failure
otbr-agent exited with code 1 (by signal 0).
```

Likely reason: on the ZBDongle-E, the CP2102N's RTS/DTR lines are wired to
the EFR32's reset and bootloader pins. That is the mechanism behind
`universal-silabs-flasher --bootloader-reset sonoff`. With `crtscts` the host
drives RTS as a flow-control line and keeps the radio in reset or the
bootloader. So **hardware flow control is not an option on this dongle,
whatever the firmware.** The change was reverted.

Supporting evidence for the link-integrity hypothesis: after the revert, the
RCP itself reported `RCP => Framing error 6` within the first seconds of
operation. The radio received a corrupted HDLC frame from the host.

Side effect seen during the rollout: kubelet rejected the new pod with
`UnexpectedAdmissionError: Allocate failed ... Unable to claim slot`
(Akri configuration-level slot `akri-openthread-usb-0`). The ReplicaSet
created ~1,200 rejected pods. The Akri Instance CR showed the slot as free.
Restarting the Akri agent pod on `hp-elitedesk` cleared the agent's stale
in-memory slot state, and the pod was admitted. Expect this on every OTBR
rollout until the Akri agent issue is fixed.

## Experiment: 460800 baud firmware (2026-10-07)

The ZBDongle-E was reflashed with "OpenThread RCP 2026.6.1_3.1.1" at 460800
baud (`rcp version`: `SL-OPENTHREAD/3.1.1.0_GitHub-fb274efe6; EFR32; Sep 12
2026`). `OT_RCP_DEVICE` was changed to match. The Thread network and Border
Agent came up unchanged.

Result: **not fixed.** During the reconnect burst after the rollout,
otbr-agent crashed 4 times in ~5 min with the same signature: the RCP reports
`Framing error 6`, then `radio tx timeout` → `RadioSpinelNoResponse`. After
that it was stable while traffic was low. The corrupted frame was a
host→RCP `STREAM_RAW` transmit frame (`84 03 71 …`, 72-byte 802.15.4 data
frame) with a bad FCS. So bytes are lost **on the RCP's UART receive
side**, at half the previous baud rate too.

Ruled out on the host: only `otbr-agent` has `/dev/ttyUSB1` open, and
ModemManager, brltty and gpsd are inactive.

## Experiment: different USB port (2026-10-07)

The ZBDongle-E was moved from USB port `3-6` to `3-7` and the host was
rebooted. Akri matched the stick by serial (new Instance
`akri-openthread-usb-fae18f`). It still enumerated as `/dev/ttyUSB1`, so no
config change was needed. OTBR came up on the existing network, the Border
Agent was `Active`, and Matter nodes 7, 8, 10 and 11 resubscribed.

Result: **not fixed.** otbr-agent restarted twice in ~8 min. The second crash
came after 5.5 min of runtime with the same signature
(`RCP => Framing error 6`, then `radio tx timeout` 5 s later →
`RadioSpinelNoResponse`). The cause of the first restart was not captured.

## Conclusion (2026-10-07)

The fault follows the dongle. Data from the host to the RCP gets corrupted
regardless of:

| Variable              | Tried                                              |
|-----------------------|----------------------------------------------------|
| RCP firmware / baud   | 921600 build and 460800 build (config matching)    |
| USB port              | `3-6` and `3-7`, before and after a host reboot    |
| Host-side contention  | only `otbr-agent` holds the TTY; ModemManager, brltty, gpsd inactive |
| Flow control          | not possible: RTS/DTR drive the EFR32 reset/bootloader |

So this is a dongle-side problem: the individual stick, or the ZBDongle-E
design without flow control. It can't be fixed in the cluster configuration.
As long as it remains, Matter OTA transfers (several minutes of sustained
traffic) will keep failing.

### Next step

Replace the Thread RCP with an adapter that has working hardware flow
control, e.g. Home Assistant Connect ZBT-1/ZBT-2. Keep the ZBDongle-E for
Zigbee or retire it. When swapping:

- update the serial in `infra/akri/resources/openthread-usb.yaml`;
- set `OT_RCP_DEVICE` to the new device path and baud rate
  (`apps/openthread/resources/deployment.yaml`);
- the Thread dataset lives in the `openthread-data` PVC (`/data`). If it's
  kept, devices should rejoin the existing network; otherwise they need
  re-pairing.

Optional: testing the stick on another machine would show whether this one
stick or the model is the problem.

Use the count of `RCP => Framing error` lines over time as a cheap health
metric for the RCP link.

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
