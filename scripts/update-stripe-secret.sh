#!/bin/bash

# Quick script to update webhook secret from Stripe CLI output
# Usage: Run this after starting stripe listen, or pipe stripe output to it

FUNCTIONS_DIR="$(cd "$(dirname "$0")/../functions" && pwd)"
RUNTIME_CONFIG_FILE="$FUNCTIONS_DIR/.runtimeconfig.json"

# Read webhook secret from stdin or argument
if [ -n "$1" ]; then
    webhook_secret="$1"
else
    # Try to read from stdin
    webhook_secret=$(grep -oP 'whsec_[a-zA-Z0-9]+' | head -1)
fi

if [ -z "$webhook_secret" ]; then
    echo "Error: No webhook secret provided"
    echo "Usage: $0 <whsec_...>"
    echo "   Or: stripe listen ... | $0"
    exit 1
fi

# Update config using Python
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
    
    print("✓ Updated webhook secret: $webhook_secret")
    sys.exit(0)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
EOF

