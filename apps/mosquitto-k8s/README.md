# Mosquitto

MQTT message broker for IoT and messaging.

## Overview

[Mosquitto](https://mosquitto.org/) is a lightweight MQTT broker enabling publish/subscribe messaging for IoT devices and services.

## Repository Structure

```
mosquitto-k8s/
├── application.yaml  # ArgoCD Application manifest
└── values.yaml       # Helm values
```

## Usage

- Used by zigbee2mqtt, esphome, and other IoT services
- MQTT over TLS supported

## Links

- Namespace: `mosquitto`
