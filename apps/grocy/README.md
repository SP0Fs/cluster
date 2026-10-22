# Grocy

Household inventory: groceries and consumables, best-before dates, minimum stock, shopping list, chores and batteries.

## Overview

[Grocy](https://grocy.info/) runs from the [linuxserver.io image](https://docs.linuxserver.io/images/docker-grocy/) as plain manifests. Its data (SQLite database, uploaded pictures, `config.php`) lives in `/config` on a `local-path` PVC. The NFS `ssd` class isn't used because SQLite needs reliable file locking.

## Repository Structure

```
grocy/
├── README.md
└── resources/
    ├── deployment.yaml
    ├── ingress.yaml   # mTLS, same CA as Home Assistant
    ├── pvc.yaml
    └── service.yaml
```

## Configuration

- Language and currency are set through `GROCY_<SETTING>` environment variables (`DEFAULT_LOCALE=de`, `CURRENCY=EUR`).
- The ingress CA secret `grocy/spof-cert` is copied out-of-band from `homeassistant/spof-cert` (see the comment in `ingress.yaml`).
- Home Assistant connects in-cluster through `http://grocy.grocy.svc.cluster.local`, using the HACS integration `custom-components/grocy` and a Grocy API key.

## Links

- UI: https://grocy.leibold.tech (client certificate required)
- Namespace: `grocy`
