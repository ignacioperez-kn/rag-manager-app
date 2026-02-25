#!/usr/bin/env bash
set -euo pipefail

GCP_PROJECT_ID="varma-projekti"
GCP_REGION="europe-north1"
SERVICE_NAME="rag-manager-app"

# --- Helpers ---

print_header() {
    echo ""
    echo "========================================================================"
    echo "  $1"
    echo "========================================================================"
}

print_success() {
    echo "[SUCCESS] $1"
}

print_error_and_exit() {
    echo "[ERROR] $1" >&2
    exit 1
}

# --- Step 1: Prerequisites ---

print_header "Step 1: Prerequisites"

command -v gcloud >/dev/null 2>&1 || print_error_and_exit "gcloud not found. Ensure Google Cloud SDK is installed and in PATH."

[[ -n "$GCP_PROJECT_ID" ]] || print_error_and_exit "Set GCP_PROJECT_ID."
[[ -n "$GCP_REGION" ]]     || print_error_and_exit "Set GCP_REGION."
[[ -n "$SERVICE_NAME" ]]   || print_error_and_exit "Set SERVICE_NAME."

print_success "Prerequisites OK"

# --- Step 2: Configure project & APIs ---

print_header "Step 2: Configure project & APIs"

gcloud config set project "$GCP_PROJECT_ID"

APIS=(
    "run.googleapis.com"
    "cloudbuild.googleapis.com"
    "artifactregistry.googleapis.com"
)

for api in "${APIS[@]}"; do
    gcloud services enable "$api"
done

print_success "Project configured and APIs enabled"

# --- Step 3: Artifact Registry ---

print_header "Step 3: Artifact Registry"

REPOSITORY_NAME="${SERVICE_NAME}-repo"

if gcloud artifacts repositories describe "$REPOSITORY_NAME" \
    --location="$GCP_REGION" --format="value(name)" >/dev/null 2>&1; then
    echo "Artifact Registry repository already exists: $REPOSITORY_NAME"
else
    gcloud artifacts repositories create "$REPOSITORY_NAME" \
        --repository-format=docker \
        --location="$GCP_REGION"
    print_success "Artifact Registry repository created: $REPOSITORY_NAME"
fi

IMAGE_URL="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${REPOSITORY_NAME}/${SERVICE_NAME}:latest"
echo "Image URL: $IMAGE_URL"

# --- Step 4: Build & push image ---

print_header "Step 4: Build & push image"

gcloud builds submit --tag "$IMAGE_URL"
print_success "Image built and pushed"

# --- Step 5: Deploy to Cloud Run ---

print_header "Step 5: Deploy to Cloud Run"

gcloud run deploy "$SERVICE_NAME" \
    --image="$IMAGE_URL" \
    --region="$GCP_REGION" \
    --platform=managed \
    --allow-unauthenticated \
    --cpu=1 \
    --memory=256Mi \
    --quiet

print_success "Deployment complete"

# --- Deployment Details ---

print_header "Deployment Details"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --platform=managed \
    --region="$GCP_REGION" \
    --format="value(status.url)")

echo "Service URL: $SERVICE_URL"
