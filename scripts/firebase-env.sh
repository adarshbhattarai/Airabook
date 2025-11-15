#!/bin/bash

# Firebase Environment Switcher Script
# Usage: ./scripts/firebase-env.sh [dev|qa|prod]

ENV=${1:-dev}

case $ENV in
  dev)
    echo "🔥 Switching to DEV environment..."
    firebase use dev
    echo "✅ Now using DEV Firebase project"
    ;;
  qa)
    echo "🔥 Switching to QA environment..."
    firebase use qa
    echo "✅ Now using QA Firebase project"
    ;;
  prod)
    echo "🔥 Switching to PROD environment..."
    firebase use prod
    echo "✅ Now using PROD Firebase project"
    echo "⚠️  WARNING: You are now using PRODUCTION!"
    ;;
  *)
    echo "❌ Invalid environment: $ENV"
    echo "Usage: ./scripts/firebase-env.sh [dev|qa|prod]"
    exit 1
    ;;
esac

echo ""
echo "Current Firebase project:"
firebase projects:list

