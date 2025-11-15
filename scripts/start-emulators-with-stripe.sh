#!/bin/bash

# Start Firebase Emulators with Stripe Webhook Setup
# This script starts both emulators and Stripe CLI, automatically updating webhook secrets

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_DIR="$PROJECT_DIR/functions"
RUNTIME_CONFIG_FILE="$FUNCTIONS_DIR/.runtimeconfig.json"
WEBHOOK_URL="http://localhost:5001/demo-project/us-central1/stripeWebhook"

# Function to extract webhook secret
extract_webhook_secret() {
    echo "$1" | grep -oP 'whsec_[a-zA-Z0-9]+' | head -1
}

# Function to update runtime config
update_runtime_config() {
    local webhook_secret="$1"
    
    if [ -z "$webhook_secret" ]; then
        return 1
    fi
    
    if [ ! -f "$RUNTIME_CONFIG_FILE" ]; then
        if [ -f "$RUNTIME_CONFIG_FILE.example" ]; then
            cp "$RUNTIME_CONFIG_FILE.example" "$RUNTIME_CONFIG_FILE"
        else
            return 1
        fi
    fi
    
    python3 << EOF
import json
import sys

try:
    with open('$RUNTIME_CONFIG_FILE', 'r') as f:
        config = json.load(f)
    
    if 'stripe' not in config:
        config['stripe'] = {}
    
    config['stripe']['webhook_secret'] = '$webhook_secret'
    
    with open('$RUNTIME_CONFIG_FILE', 'w') as f:
        json.dump(config, f, indent=2)
    
    print("✓ Updated webhook secret")
    sys.exit(0)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
EOF
}

# Function to start Stripe CLI in background
start_stripe_cli() {
    echo -e "${BLUE}Starting Stripe CLI...${NC}"
    
    # Check if Stripe CLI is installed
    if ! command -v stripe &> /dev/null; then
        echo -e "${YELLOW}Warning: Stripe CLI not found. Skipping Stripe setup.${NC}"
        echo "Install with: brew install stripe/stripe-cli/stripe"
        return 1
    fi
    
    # Start stripe listen in background and capture PID
    (
        stripe listen --forward-to "$WEBHOOK_URL" 2>&1 | while IFS= read -r line; do
            echo "[Stripe] $line"
            
            # Extract and update webhook secret
            webhook_secret=$(extract_webhook_secret "$line")
            if [ -n "$webhook_secret" ]; then
                echo -e "${GREEN}[Stripe] Found webhook secret, updating config...${NC}"
                if update_runtime_config "$webhook_secret"; then
                    echo -e "${GREEN}[Stripe] ✓ Webhook secret updated successfully${NC}"
                fi
            fi
        done
    ) &
    
    STRIPE_PID=$!
    echo $STRIPE_PID > /tmp/stripe-cli.pid
    echo -e "${GREEN}✓ Stripe CLI started (PID: $STRIPE_PID)${NC}"
    echo -e "${YELLOW}Webhook secret will be auto-updated when available${NC}"
}

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    
    # Kill Stripe CLI if running
    if [ -f /tmp/stripe-cli.pid ]; then
        STRIPE_PID=$(cat /tmp/stripe-cli.pid)
        if kill -0 $STRIPE_PID 2>/dev/null; then
            echo -e "${BLUE}Stopping Stripe CLI (PID: $STRIPE_PID)...${NC}"
            kill $STRIPE_PID 2>/dev/null || true
        fi
        rm -f /tmp/stripe-cli.pid
    fi
    
    # Kill Firebase emulators
    pkill -f "firebase.*emulator" || true
    pkill -f "cloud-firestore-emulator" || true
    
    echo -e "${GREEN}✓ Cleanup complete${NC}"
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGINT SIGTERM EXIT

# Main execution
main() {
    echo -e "${GREEN}=== Starting Firebase Emulators with Stripe ===${NC}"
    echo ""
    
    # Start Stripe CLI first (in background)
    start_stripe_cli
    
    # Wait a moment for Stripe to initialize
    sleep 2
    
    echo ""
    echo -e "${GREEN}Starting Firebase Emulators...${NC}"
    echo ""
    
    # Start Firebase emulators (this will block)
    cd "$PROJECT_DIR"
    firebase emulators:start --project local --inspect-functions
}

# Run main function
main

