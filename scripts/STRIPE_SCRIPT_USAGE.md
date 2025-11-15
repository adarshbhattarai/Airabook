# Stripe Webhook Script Usage

## Overview

Two scripts are available to automate Stripe webhook secret management:

1. **`setup-stripe-webhook.sh`** - Full automation: Starts Stripe CLI, extracts secret, updates config
2. **`update-stripe-secret.sh`** - Quick update: Just updates the config file with a provided secret

## Quick Start

### Option 1: Automated Setup (Recommended)

Run the full setup script which handles everything:

```bash
npm run stripe:setup
```

This will:
1. Check if Stripe CLI is installed
2. Check if you're logged in
3. Start `stripe listen`
4. Automatically extract the webhook secret from output
5. Update `.runtimeconfig.json` automatically
6. Keep Stripe CLI running

**Press Ctrl+C to stop.**

### Option 2: Manual Update

If you already have Stripe CLI running and just want to update the secret:

```bash
# Get the secret from Stripe CLI output, then:
npm run stripe:update-secret whsec_YOUR_SECRET_HERE
```

Or pipe Stripe output directly:

```bash
stripe listen --forward-to http://localhost:5001/demo-project/us-central1/stripeWebhook | \
  grep -oP 'whsec_[a-zA-Z0-9]+' | \
  head -1 | \
  xargs npm run stripe:update-secret
```

## Daily/Startup Usage

### macOS/Linux: Add to Startup

Create a launch agent or systemd service to run automatically:

**macOS (LaunchAgent)**:

Create `~/Library/LaunchAgents/com.airabook.stripe-webhook.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.airabook.stripe-webhook</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/YOUR_USERNAME/code/project2025/airabook/Airabook/scripts/setup-stripe-webhook.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/stripe-webhook.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/stripe-webhook.error.log</string>
</dict>
</plist>
```

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.airabook.stripe-webhook.plist
```

**Linux (systemd)**:

Create `/etc/systemd/system/stripe-webhook.service`:

```ini
[Unit]
Description=Stripe Webhook Forwarder
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/path/to/Airabook
ExecStart=/path/to/Airabook/scripts/setup-stripe-webhook.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable stripe-webhook.service
sudo systemctl start stripe-webhook.service
```

### Cron Job (Alternative)

If you prefer cron, add to crontab:

```bash
crontab -e
```

Add:
```cron
# Run Stripe webhook setup daily at 9 AM
0 9 * * * cd /path/to/Airabook && npm run stripe:setup > /tmp/stripe-setup.log 2>&1
```

**Note**: This will restart Stripe CLI daily, which generates a new secret. The script will automatically update your config.

## How It Works

### `setup-stripe-webhook.sh`

1. **Pre-flight checks**: Verifies Stripe CLI is installed and you're logged in
2. **Starts Stripe CLI**: Runs `stripe listen --forward-to ...`
3. **Monitors output**: Watches for webhook secret in the output
4. **Extracts secret**: Uses regex to find `whsec_...` pattern
5. **Updates config**: Automatically updates `.runtimeconfig.json` using Python
6. **Keeps running**: Continues forwarding webhooks until stopped

### `update-stripe-secret.sh`

1. **Takes secret**: As argument or from stdin
2. **Updates config**: Modifies `.runtimeconfig.json` with new secret
3. **Validates**: Ensures JSON is valid after update

## Troubleshooting

### Script doesn't find webhook secret

**Check Stripe CLI output**: The secret appears in the first few lines after starting `stripe listen`

**Manual extraction**: Run Stripe CLI manually and copy the secret:
```bash
stripe listen --forward-to http://localhost:5001/demo-project/us-central1/stripeWebhook
# Look for: "Your webhook signing secret is whsec_..."
```

### Python not found

The scripts use Python 3 for JSON manipulation. Install if needed:
```bash
# macOS
brew install python3

# Linux
sudo apt-get install python3
```

### Permission denied

Make scripts executable:
```bash
chmod +x scripts/setup-stripe-webhook.sh
chmod +x scripts/update-stripe-secret.sh
```

### Config file not updating

**Check file exists**: Ensure `.runtimeconfig.json` exists (copy from example if needed)

**Check permissions**: Ensure you have write permissions:
```bash
ls -la functions/.runtimeconfig.json
```

## Example Workflow

### Daily Development

```bash
# Terminal 1: Start emulators
npm run emulators:local

# Terminal 2: Start Stripe webhook (auto-updates config)
npm run stripe:setup

# Terminal 3: Start frontend
npm start
```

### Quick Secret Update

If you restart Stripe CLI and get a new secret:

```bash
# Copy the whsec_... from Stripe CLI output, then:
npm run stripe:update-secret whsec_YOUR_NEW_SECRET
```

## Logs

The main script logs to:
- Console output (real-time)
- `functions/stripe-webhook.log` (persistent log)

Check logs if something goes wrong:
```bash
tail -f functions/stripe-webhook.log
```

