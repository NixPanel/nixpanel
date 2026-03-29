#!/usr/bin/env bash
set -euo pipefail

# NixPanel Installer
# Usage: bash install.sh

NIXPANEL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_MIN_VERSION=18

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     NixPanel Installation Script     ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── Check Node.js ────────────────────────────────────────────────────────────
check_node() {
    if ! command -v node &>/dev/null; then
        echo "✗ Node.js not found. Please install Node.js ${NODE_MIN_VERSION}+ first."
        echo "  Visit: https://nodejs.org or use your package manager:"
        echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
        echo "  sudo apt-get install -y nodejs"
        exit 1
    fi

    NODE_VERSION=$(node -e "process.exit(parseInt(process.version.slice(1).split('.')[0]))" 2>/dev/null; echo $?)
    MAJOR=$(node -e "console.log(parseInt(process.version.slice(1).split('.')[0]))")
    if [ "$MAJOR" -lt "$NODE_MIN_VERSION" ]; then
        echo "✗ Node.js ${NODE_MIN_VERSION}+ required, found $(node --version)"
        exit 1
    fi
    echo "✓ Node.js $(node --version) detected"
}

# ─── Setup .env ───────────────────────────────────────────────────────────────
setup_env() {
    if [ ! -f "${NIXPANEL_DIR}/.env" ]; then
        echo "→ Creating .env from .env.example..."
        cp "${NIXPANEL_DIR}/.env.example" "${NIXPANEL_DIR}/.env"

        # Generate a random JWT secret
        if command -v openssl &>/dev/null; then
            JWT_SECRET=$(openssl rand -hex 64)
            if [[ "$(uname)" == "Darwin" ]]; then
                sed -i '' "s/your_super_secret_jwt_key_change_this_in_production/${JWT_SECRET}/" "${NIXPANEL_DIR}/.env"
            else
                sed -i "s/your_super_secret_jwt_key_change_this_in_production/${JWT_SECRET}/" "${NIXPANEL_DIR}/.env"
            fi
            echo "✓ Generated random JWT secret"
        else
            echo "⚠ openssl not found. Please manually set JWT_SECRET in .env"
        fi
        echo "✓ .env created. Please review and set ANTHROPIC_API_KEY if you want AI features."
    else
        echo "✓ .env already exists, skipping..."
    fi
}

# ─── Install server deps ──────────────────────────────────────────────────────
install_server() {
    echo "→ Installing server dependencies..."
    cd "${NIXPANEL_DIR}"
    npm install --production
    echo "✓ Server dependencies installed"
}

# ─── Install & build client ───────────────────────────────────────────────────
install_client() {
    echo "→ Installing client dependencies..."
    cd "${NIXPANEL_DIR}/client"
    npm install
    echo "→ Building client (this may take a moment)..."
    npm run build
    echo "✓ Client built successfully"
}

# ─── Optional: systemd service ───────────────────────────────────────────────
setup_systemd() {
    if ! command -v systemctl &>/dev/null; then
        return
    fi

    echo ""
    read -rp "Set up systemd service for auto-start? [y/N] " SETUP_SYSTEMD
    if [[ "${SETUP_SYSTEMD,,}" != "y" ]]; then
        return
    fi

    NODE_BIN=$(command -v node)
    CURRENT_USER=$(whoami)

    cat > /tmp/nixpanel.service <<EOF
[Unit]
Description=NixPanel - Linux Administration Panel
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${NIXPANEL_DIR}
ExecStart=${NODE_BIN} server/index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=nixpanel
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    sudo mv /tmp/nixpanel.service /etc/systemd/system/nixpanel.service
    sudo systemctl daemon-reload
    sudo systemctl enable nixpanel
    sudo systemctl start nixpanel
    echo "✓ Systemd service installed and started"
    echo "  Manage with: systemctl {start|stop|restart|status} nixpanel"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
    check_node
    setup_env
    install_server
    install_client
    setup_systemd

    PORT=$(grep -E "^PORT=" "${NIXPANEL_DIR}/.env" 2>/dev/null | cut -d= -f2 || echo "3001")
    ADMIN_USER=$(grep -E "^ADMIN_USERNAME=" "${NIXPANEL_DIR}/.env" 2>/dev/null | cut -d= -f2 || echo "admin")

    echo ""
    echo "╔══════════════════════════════════════════╗"
    echo "║         Installation Complete!           ║"
    echo "╠══════════════════════════════════════════╣"
    echo "║                                          ║"
    echo "║  Start: node server/index.js             ║"
    echo "║  Or:    npm start                        ║"
    echo "║                                          ║"
    echo "║  URL:   http://localhost:${PORT}            ║"
    echo "║  User:  ${ADMIN_USER}                    ║"
    echo "║  Pass:  (set ADMIN_PASSWORD in .env)     ║"
    echo "║                                          ║"
    echo "║  ⚠ Change default password on first     ║"
    echo "║    login!                                ║"
    echo "╚══════════════════════════════════════════╝"
    echo ""
}

main "$@"
