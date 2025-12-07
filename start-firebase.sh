#!/bin/bash

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Ensure Node 20 is used by prioritizing it in PATH
# simple 'nvm use' can fail in some shell environments
TARGET_VER=20
NODE_BIN=$(nvm which $TARGET_VER)

if [ -z "$NODE_BIN" ]; then
    echo "Node $TARGET_VER not found. Installing..."
    nvm install $TARGET_VER
    NODE_BIN=$(nvm which $TARGET_VER)
fi

# Prepend the Node bin directory to PATH
export PATH="$(dirname "$NODE_BIN"):$PATH"

echo "Using Node version: $(node --version)"
echo "Node binary: $(which node)"

# Start Firebase emulators with arguments
npx firebase emulators:start "$@"
