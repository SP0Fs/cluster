#!/bin/bash
# Migration helper script for ESS deployment
# Run this on the cluster after ensuring ArgoCD has synced

set -e

NAMESPACE="${NAMESPACE:-matrix}"
SECRET_NAME="${SECRET_NAME:-matrix-secret}"

echo "=== ESS Migration Helper ==="
echo ""

# Step 1: Get existing secrets from the cluster
echo "Step 1: Getting existing secrets from cluster..."
echo ""

# Get the secrets.yaml content and decode it
SECRETS_YAML=$(kubectl get secret "$SECRET_NAME" -n "$NAMESPACE" -o jsonpath='{.data.secrets\.yaml}' 2>/dev/null | base64 -d)

if [ -z "$SECRETS_YAML" ]; then
    echo "ERROR: Could not retrieve secrets.yaml from secret $SECRET_NAME"
    exit 1
fi

echo "Retrieved secrets.yaml content:"
echo "$SECRETS_YAML" | head -20
echo "..."
echo ""

# Step 2: Extract individual values
echo "Step 2: Extract individual secret values..."
echo ""

DB_PASSWORD=$(echo "$SECRETS_YAML" | grep '^db_password:' | head -1 | awk '{print $2}' | tr -d '"' | tr -d "'")
MACAROON_SECRET=$(echo "$SECRETS_YAML" | grep '^macaroon_secret_key:' | head -1 | awk '{print $2}' | tr -d '"' | tr -d "'")
REGISTRATION_SHARED_SECRET=$(echo "$SECRETS_YAML" | grep '^registration_shared_secret:' | head -1 | awk '{print $2}' | tr -d '"' | tr -d "'")
SIGNING_KEY=$(echo "$SECRETS_YAML" | grep '^signing_key:' | head -1 | awk '{print $2}' | tr -d '"' | tr -d "'")

echo "Extracted:"
[ -n "$DB_PASSWORD" ] && echo "  db_password: <present>"
[ -n "$MACAROON_SECRET" ] && echo "  macaroon_secret_key: <present>"
[ -n "$REGISTRATION_SHARED_SECRET" ] && echo "  registration_shared_secret: <present>"
[ -n "$SIGNING_KEY" ] && echo "  signing_key: <present>"
echo ""

# Step 3: Create secrets for ESS
echo "Step 3: Creating Kubernetes secrets for ESS..."

# Delete existing secret if present
kubectl delete secret ess-secrets -n "$NAMESPACE" 2>/dev/null || true

# Create a secret with individual keys for ESS
kubectl create secret generic ess-secrets -n "$NAMESPACE" \
    --from-literal=db_password="$DB_PASSWORD" \
    --from-literal=macaroon_secret_key="$MACAROON_SECRET" \
    --from-literal=registration_shared_secret="$REGISTRATION_SHARED_SECRET" \
    --from-literal=signing_key="$SIGNING_KEY"

echo "Created ess-secrets secret in namespace $NAMESPACE"
echo ""

# Step 4: Create MAS database
echo "Step 4: Creating MAS database..."
echo "Run the following commands against your PostgreSQL:"
echo ""
echo "  kubectl exec -it postgres-postgresql-primary-0 -n postgres -- \\"
echo "    psql -U postgres -c \"CREATE DATABASE mas;\""
echo "  kubectl exec -it postgres-postgresql-primary-0 -n postgres -- \\"
echo "    psql -U postgres -c \"GRANT ALL PRIVILEGES ON DATABASE mas TO synapse;\""
echo ""

# Step 5: Verify ArgoCD synced
echo "Step 5: Verify ArgoCD Application status..."
kubectl get application matrix-ess -n argo-cd 2>/dev/null || echo "Application not found - check ArgoCD"

echo ""
echo "=== Next Steps ==="
echo "1. Ensure DNS records exist for:"
echo "   - account.matrix.leibold.tech -> ingress IP"
echo "   - admin.matrix.leibold.tech -> ingress IP"
echo ""
echo "2. Create admin user after deployment:"
echo "   kubectl exec -n matrix -it deploy/ess-matrix-authentication-service -- \\"
echo "     mas-cli manage register-user --yes <username>"
echo ""
echo "3. Test Element X login at https://matrix.leibold.tech"
