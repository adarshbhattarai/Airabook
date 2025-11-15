#!/bin/bash

# Stripe Webhook Setup Script
# This script starts Stripe CLI, extracts the webhook secret, and updates .runtimeconfig.json

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
FUNCTIONS_DIR="$(cd "$(dirname "$0")/../functions" && pwd)"
RUNTIME_CONFIG_FILE="$FUNCTIONS_DIR/.runtimeconfig.json"
WEBHOOK_URL="http://localhost:5001/demo-project/us-central1/stripeWebhook"
LOG_FILE="$FUNCTIONS_DIR/stripe-webhook.log"

# Function to extract webhook secret from Stripe CLI output
extract_webhook_secret() {
    local output="$1"
    # Look for pattern: "whsec_..." in the output
    echo "$output" | grep -oP 'whsec_[a-zA-Z0-9]+' | head -1
}

# Function to update .runtimeconfig.json with new webhook secret
update_runtime_config() {
    local webhook_secret="$1"
    
    if [ -z "$webhook_secret" ]; then
        echo -e "${RED}Error: Webhook secret is empty${NC}"
        return 1
    fi
    
    # Check if .runtimeconfig.json exists
    if [ ! -f "$RUNTIME_CONFIG_FILE" ]; then
        echo -e "${YELLOW}Warning: .runtimeconfig.json not found. Creating from example...${NC}"
        if [ -f "$RUNTIME_CONFIG_FILE.example" ]; then
            cp "$RUNTIME_CONFIG_FILE.example" "$RUNTIME_CONFIG_FILE"
        else
            echo -e "${RED}Error: .runtimeconfig.json.example not found${NC}"
            return 1
        fi
    fi
    
    # Update the webhook secret in the JSON file
    # Using Python for reliable JSON manipulation
    python3 << EOF
import json
import sys

try:
    with open('$RUNTIME_CONFIG_FILE', 'r') as f:
        config = json.load(f)
    
    # Ensure stripe object exists
    if 'stripe' not in config:
        config['stripe'] = {}
    
    # Update webhook secret
    config['stripe']['webhook_secret'] = '$webhook_secret'
    
    # Write back
    with open('$RUNTIME_CONFIG_FILE', 'w') as f:
        json.dump(config, f, indent=2)
    
    print("✓ Updated webhook secret in .runtimeconfig.json")
    sys.exit(0)
except Exception as e:
    print(f"Error updating config: {e}")
    sys.exit(1)
EOF
}

# Function to start Stripe CLI and monitor for webhook secret
start_stripe_listen() {
    echo -e "${GREEN}Starting Stripe CLI...${NC}"
    echo "Webhook URL: $WEBHOOK_URL"
    echo "Log file: $LOG_FILE"
    echo ""
    echo -e "${YELLOW}Waiting for webhook secret from Stripe CLI...${NC}"
    echo ""
    
    # Start stripe listen and capture output
    stripe listen --forward-to "$WEBHOOK_URL" 2>&1 | tee "$LOG_FILE" | while IFS= read -r line; do
        echo "$line"
        
        # Look for webhook secret in the output
        webhook_secret=$(extract_webhook_secret "$line")
        
        if [ -n "$webhook_secret" ]; then
            echo ""
            echo -e "${GREEN}✓ Found webhook secret: ${webhook_secret}${NC}"
            echo -e "${YELLOW}Updating .runtimeconfig.json...${NC}"
            
            if update_runtime_config "$webhook_secret"; then
                echo -e "${GREEN}✓ Successfully updated .runtimeconfig.json${NC}"
                echo ""
                echo -e "${GREEN}Stripe CLI is now running and forwarding webhooks.${NC}"
                echo -e "${GREEN}Press Ctrl+C to stop.${NC}"
                echo ""
            else
                echo -e "${RED}✗ Failed to update .runtimeconfig.json${NC}"
            fi
        fi
    done
}

# Function to check if Stripe CLI is installed
check_stripe_cli() {
    if ! command -v stripe &> /dev/null; then
        echo -e "${RED}Error: Stripe CLI is not installed${NC}"
        echo "Install it with: brew install stripe/stripe-cli/stripe"
        exit 1
    fi
}

# Function to check if user is logged in to Stripe CLI
check_stripe_login() {
    if ! stripe config --list &> /dev/null; then
        echo -e "${YELLOW}Warning: You may not be logged in to Stripe CLI${NC}"
        echo "Run: stripe login"
        echo ""
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Main execution
main() {
    echo -e "${GREEN}=== Stripe Webhook Setup Script ===${NC}"
    echo ""
    
    # Pre-flight checks
    check_stripe_cli
    check_stripe_login
    
    # Ensure functions directory exists
    if [ ! -d "$FUNCTIONS_DIR" ]; then
        echo -e "${RED}Error: Functions directory not found: $FUNCTIONS_DIR${NC}"
        exit 1
    fi
    
    # Start Stripe listen
    start_stripe_listen
}

# Run main function
main

