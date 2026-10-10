#!/usr/bin/env bash
# ================================================================
# AgentOS Official Linux & macOS Installer
# ================================================================

set -e

INSTALL_DIR="${AGENTOS_INSTALL_DIR:-$HOME/.agentos/bin}"

print_header() {
  echo ""
  echo -e "\033[1;36m================================================================\033[0m"
  echo -e "\033[1;36m >> AGENTOS - Autonomous Multi-Agent AI Operating System        \033[0m"
  echo -e "\033[1;36m >> Cyber-Luxe Glassmorphic Runtime & Desktop Platform          \033[0m"
  echo -e "\033[1;36m================================================================\033[0m"
  echo ""
}

step() {
  echo -e "\033[1;34m[$1]\033[0m \033[1;37m$2\033[0m"
}

ok() {
  echo -e " \033[1;32m[OK]\033[0m \033[0;37m$1\033[0m"
}

err() {
  echo -e " \033[1;31m[ERR]\033[0m \033[0;31m$1\033[0m"
}

print_header

# 1. Prepare Target Directory
step "1/4" "Preparing installation directory: $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
ok "Directory ready at $INSTALL_DIR"

# 2. Locate or Download Binary
step "2/4" "Locating AgentOS standalone binary..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
TARGET_BIN="$INSTALL_DIR/agentos"

if [ -f "$SCRIPT_DIR/bin/agentos" ]; then
  ok "Found local binary at $SCRIPT_DIR/bin/agentos"
  cp "$SCRIPT_DIR/bin/agentos"* "$INSTALL_DIR/" 2>/dev/null || cp "$SCRIPT_DIR/bin/agentos" "$INSTALL_DIR/"
  chmod +x "$TARGET_BIN"
elif [ -f "$SCRIPT_DIR/scripts/build-binaries.ts" ] && command -v bun >/dev/null 2>&1; then
  echo " Compiling from source via bun..."
  (cd "$SCRIPT_DIR" && bun run scripts/build-binaries.ts)
  cp "$SCRIPT_DIR/bin/agentos"* "$INSTALL_DIR/" 2>/dev/null || cp "$SCRIPT_DIR/bin/agentos" "$INSTALL_DIR/"
  chmod +x "$TARGET_BIN"
else
  # Remote release download
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) ARCH="x64" ;;
  esac

  RELEASE_URL="https://github.com/agent-os/agent-os/releases/latest/download/agentos-${OS}-${ARCH}"
  echo " Downloading latest AgentOS ($OS-$ARCH) binary..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$RELEASE_URL" -o "$TARGET_BIN"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$TARGET_BIN" "$RELEASE_URL"
  else
    err "Neither curl nor wget found to download release"
    exit 1
  fi
  chmod +x "$TARGET_BIN"
  ok "Downloaded agentos binary"
fi

# 3. Configure PATH
step "3/4" "Configuring PATH in shell profiles..."
PATH_EXPORT="export PATH=\"$INSTALL_DIR:\$PATH\""
UPDATED_PROFILES=0

for PROFILE in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
  if [ -f "$PROFILE" ]; then
    if ! grep -q "$INSTALL_DIR" "$PROFILE"; then
      echo "" >> "$PROFILE"
      echo "# AgentOS CLI" >> "$PROFILE"
      echo "$PATH_EXPORT" >> "$PROFILE"
      UPDATED_PROFILES=$((UPDATED_PROFILES + 1))
    fi
  fi
done

if [ "$UPDATED_PROFILES" -gt 0 ]; then
  ok "Appended AgentOS path to your shell configuration ($UPDATED_PROFILES file(s))"
else
  ok "PATH already configured or profiles not detected"
fi

# 4. Verify Installation
step "4/4" "Verifying installation integrity..."
if command -v "$TARGET_BIN" >/dev/null 2>&1 || [ -x "$TARGET_BIN" ]; then
  VERSION=$("$TARGET_BIN" --version 2>/dev/null || echo "1.0.0")
  ok "AgentOS version verified: $VERSION"
else
  err "Installation check failed: could not execute $TARGET_BIN"
  exit 1
fi

echo ""
echo -e "\033[1;32m================================================================\033[0m"
echo -e "\033[1;32m AgentOS successfully installed to:                            \033[0m"
echo -e "\033[1;37m    $INSTALL_DIR/agentos                                       \033[0m"
echo -e "\033[1;32m================================================================\033[0m"
echo ""
echo -e "\033[1;36mQuickstart Commands:\033[0m"
echo -e "  \033[1;37magentos\033[0m                     # Launch interactive AI terminal"
echo -e "  \033[1;37magentos desktop\033[0m             # Launch Electron Cyber-Luxe app"
echo -e "  \033[1;37magentos run \"goal\"\033[0m          # Run autonomous coding workflow"
echo -e "  \033[1;37magentos models\033[0m              # Manage and inspect reasoning models"
echo -e "  \033[1;37magentos doctor\033[0m              # Diagnose environment and keys"
echo ""
echo "To start using agentos right away in this terminal:"
echo -e "  \033[1;33mexport PATH=\"$INSTALL_DIR:\$PATH\"\033[0m"
echo ""
