#!/bin/sh
set -e

# Ensure the SSH directory exists on the PVC with correct permissions.
# This runs after the PVC is mounted, so build-time mkdir is not sufficient.
mkdir -p /root/.nanobot/ssh
chmod 700 /root/.nanobot/ssh

exec nanobot "$@"
