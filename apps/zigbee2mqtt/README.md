# Zigbee2MQTT

Zigbee bridge for smart home devices.

## Overview

[Zigbee2MQTT](https://www.zigbee2mqtt.io/) bridges Zigbee devices to MQTT, enabling control of many smart home devices without vendor lock-in.

## Repository Structure

```
zigbee2mqtt-k8s/
├── application.yaml  # ArgoCD Application manifest
└── resources/        # Kubernetes manifests
```

## Configuration

- MQTT integration with mosquitto
- USB Zigbee adapter passthrough

## Links

- UI: https://zigbee2mqtt.spof.local
- Namespace: `zigbee2mqtt`
