#!/usr/bin/env bash
# NixPanel Installer
# Supports: AlmaLinux 9, Rocky Linux 9, RHEL 9, Ubuntu 22.04/24.04, Debian 11/12
# Usage: bash install.sh

# Note: set +u before pipefail to avoid BASH_SOURCE/array unbound errors on
# minimal AlmaLinux 9 installs where bash arrays may not be initialized.
set -eo pipefail
set +u

# ─── Constants ────────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/nixpanel"
REPO_URL="https://github.com/NixPanel/nixpanel.git"
LOG_FILE="/tmp/nixpanel-install.log"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Logging ─────────────────────────────────────────────────────────────────
log()   { echo -e "${CYAN}[nixpanel]${NC} $*" | tee -a "$LOG_FILE"; }
ok()    { echo -e "${GREEN}[✓]${NC} $*" | tee -a "$LOG_FILE"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*" | tee -a "$LOG_FILE"; }
err()   { echo -e "${RED}[✗]${NC} $*" | tee -a "$LOG_FILE" >&2; }
arrow() { echo -e "${CYAN}[↓]${NC} $*" | tee -a "$LOG_FILE"; }

# ─── Error handler ────────────────────────────────────────────────────────────
handle_error() {
    local exit_code=$?
    local line_number=$1
    local command="$BASH_COMMAND"

    echo "" >&2
    err "Installation failed!"
    err "  Line    : ${line_number}"
    err "  Command : ${command}"
    err "  Exit    : ${exit_code}"
    err "  Log     : ${LOG_FILE}"
    echo "" >&2
    err "To fix manually, check the log:"
    err "  cat ${LOG_FILE}"
    echo "" >&2
    exit "$exit_code"
}

trap 'handle_error $LINENO' ERR

# ─── OS Detection ─────────────────────────────────────────────────────────────
detect_os() {
    if [ ! -f /etc/os-release ]; then
        err "Cannot detect OS: /etc/os-release not found."
        err "Supported: AlmaLinux 9, Rocky Linux 9, RHEL 9, Ubuntu 22.04/24.04, Debian 11/12"
        exit 1
    fi

    # shellcheck source=/dev/null
    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_ID_LIKE="${ID_LIKE:-}"
    OS_VERSION="${VERSION_ID:-}"

    case "$OS_ID" in
        almalinux|rocky|rhel|centos|fedora)
            OS_FAMILY="rhel"
            PKG_MGR="dnf"
            ;;
        ubuntu|debian|linuxmint|pop)
            OS_FAMILY="debian"
            PKG_MGR="apt-get"
            ;;
        *)
            if echo "$OS_ID_LIKE" | grep -qiE "rhel|fedora|centos"; then
                OS_FAMILY="rhel"
                PKG_MGR="dnf"
            elif echo "$OS_ID_LIKE" | grep -qiE "debian|ubuntu"; then
                OS_FAMILY="debian"
                PKG_MGR="apt-get"
            else
                err "Unsupported OS: ${OS_ID} (${OS_ID_LIKE:-no ID_LIKE})"
                err "Supported: AlmaLinux, Rocky Linux, RHEL, Ubuntu, Debian"
                exit 1
            fi
            ;;
    esac

    ok "Detected OS: ${OS_ID} ${OS_VERSION} (${OS_FAMILY} family)"
}

# ─── Privilege check ──────────────────────────────────────────────────────────
check_root() {
    if [ "$(id -u)" -ne 0 ]; then
        err "This installer must be run as root (or via sudo)."
        err "Try: sudo bash install.sh"
        exit 1
    fi
    ok "Running as root"
}

# ─── Package manager helpers ──────────────────────────────────────────────────
pkg_install() {
    if [ "$OS_FAMILY" = "rhel" ]; then
        dnf install -y "$@" >> "$LOG_FILE" 2>&1
    else
        DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" >> "$LOG_FILE" 2>&1
    fi
}

pkg_update() {
    log "Updating package lists..."
    if [ "$OS_FAMILY" = "rhel" ]; then
        dnf makecache -y >> "$LOG_FILE" 2>&1
    else
        apt-get update -y >> "$LOG_FILE" 2>&1
    fi
    ok "Package lists updated"
}

# ─── Install Node.js 20.x ────────────────────────────────────────────────────
install_nodejs() {
    arrow "nodejs not found - installing Node.js 20.x via NodeSource..."

    if [ "$OS_FAMILY" = "rhel" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >> "$LOG_FILE" 2>&1 || {
            err "NodeSource setup script failed."
            err "Check network connectivity and try manually:"
            err "  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -"
            err "  dnf install -y nodejs"
            exit 1
        }
        dnf install -y nodejs >> "$LOG_FILE" 2>&1 || {
            err "dnf install nodejs failed after NodeSource setup."
            err "Try manually: dnf install -y nodejs"
            exit 1
        }
    else
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >> "$LOG_FILE" 2>&1 || {
            err "NodeSource setup script failed."
            err "Check network connectivity and try manually:"
            err "  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
            err "  apt-get install -y nodejs"
            exit 1
        }
        DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >> "$LOG_FILE" 2>&1 || {
            err "apt-get install nodejs failed after NodeSource setup."
            err "Try manually: apt-get install -y nodejs"
            exit 1
        }
    fi

    if ! command -v node > /dev/null 2>&1; then
        err "Node.js installation completed but 'node' command not found."
        err "This may be a PATH issue. Check: which node"
        err "Or reinstall manually using the NodeSource instructions above."
        exit 1
    fi

    local ver
    ver=$(node --version)
    ok "nodejs ${ver} installed successfully"
}

# ─── Dependency checker / installer ──────────────────────────────────────────
# check_dep <display_name> <command> <install_pkg_or_fn>
check_dep() {
    local name="$1"
    local cmd="$2"
    local install_action="$3"

    if command -v "$cmd" > /dev/null 2>&1; then
        local ver
        ver=$("$cmd" --version 2>/dev/null | head -1 || true)
        ok "${name} already installed${ver:+ (${ver})}"
        return 0
    fi

    if [ -z "$install_action" ]; then
        err "${name} not found and no install method provided."
        exit 1
    fi

    arrow "${name} not found - installing..."

    if [ "${install_action#fn:}" != "$install_action" ]; then
        "${install_action#fn:}"
    else
        pkg_install "$install_action" || {
            err "Failed to install ${name} via package manager."
            err "Try manually: ${PKG_MGR} install -y ${install_action}"
            exit 1
        }
    fi

    if command -v "$cmd" > /dev/null 2>&1; then
        local ver
        ver=$("$cmd" --version 2>/dev/null | head -1 || true)
        ok "${name} installed successfully${ver:+ (${ver})}"
    else
        err "${name} install command ran but '${cmd}' still not found."
        err "Check ${LOG_FILE} for details."
        exit 1
    fi
}

# ─── Install EPEL (RHEL family only) ─────────────────────────────────────────
ensure_epel() {
    if [ "$OS_FAMILY" != "rhel" ]; then
        return 0
    fi

    if rpm -q epel-release > /dev/null 2>&1; then
        ok "epel-release already installed"
        return 0
    fi

    arrow "epel-release not found - installing (required for certbot)..."
    dnf install -y epel-release >> "$LOG_FILE" 2>&1 || {
        err "Failed to install epel-release."
        err "Try manually: dnf install -y epel-release"
        exit 1
    }
    dnf makecache -y >> "$LOG_FILE" 2>&1 || true
    ok "epel-release installed successfully"
}

# ─── Install pm2 ─────────────────────────────────────────────────────────────
install_pm2() {
    npm install -g pm2 >> "$LOG_FILE" 2>&1 || {
        err "npm install -g pm2 failed."
        err "Check npm is working: npm --version"
        err "Try manually: npm install -g pm2"
        exit 1
    }
}

# ─── All system dependencies ──────────────────────────────────────────────────
install_system_deps() {
    log "Checking and installing system dependencies..."
    echo ""

    pkg_update
    ensure_epel

    check_dep "git"     "git"     "git"
    check_dep "curl"    "curl"    "curl"
    check_dep "wget"    "wget"    "wget"
    check_dep "openssl" "openssl" "openssl"

    # Node.js 20.x
    if command -v node > /dev/null 2>&1; then
        local major
        major=$(node -e "console.log(parseInt(process.version.slice(1).split('.')[0]))")
        if [ "$major" -ge 20 ]; then
            ok "nodejs $(node --version) already installed"
        else
            warn "nodejs $(node --version) found but version < 20 - upgrading..."
            install_nodejs
        fi
    else
        install_nodejs
    fi

    if command -v npm > /dev/null 2>&1; then
        ok "npm $(npm --version) already installed"
    else
        err "npm not found after Node.js install. Something went wrong."
        err "Try reinstalling Node.js manually."
        exit 1
    fi

    if command -v pm2 > /dev/null 2>&1; then
        ok "pm2 $(pm2 --version 2>/dev/null | head -1) already installed"
    else
        arrow "pm2 not found - installing..."
        install_pm2
        ok "pm2 $(pm2 --version 2>/dev/null | head -1) installed successfully"
    fi

    check_dep "certbot" "certbot" "certbot"

    echo ""
    ok "All system dependencies satisfied"
}

# ─── Clone repository ─────────────────────────────────────────────────────────
clone_repo() {
    if [ -d "${INSTALL_DIR}/.git" ]; then
        ok "NixPanel repository already present at ${INSTALL_DIR}"
        log "Pulling latest changes..."
        git -C "${INSTALL_DIR}" pull >> "$LOG_FILE" 2>&1 || {
            warn "git pull failed - continuing with existing code"
        }
        return 0
    fi

    if [ -d "$INSTALL_DIR" ]; then
        err "${INSTALL_DIR} already exists but is not a git repository."
        err "Remove it and try again: rm -rf ${INSTALL_DIR}"
        exit 1
    fi

    arrow "Cloning NixPanel into ${INSTALL_DIR}..."
    git clone "$REPO_URL" "$INSTALL_DIR" >> "$LOG_FILE" 2>&1 || {
        err "git clone failed."
        err "  Source : ${REPO_URL}"
        err "  Dest   : ${INSTALL_DIR}"
        err "Check network connectivity and that git is installed."
        err "Try manually: git clone ${REPO_URL} ${INSTALL_DIR}"
        exit 1
    }
    ok "Repository cloned to ${INSTALL_DIR}"
}

# ─── Verify install directory ─────────────────────────────────────────────────
verify_install_dir() {
    local missing=0

    if [ ! -d "$INSTALL_DIR" ]; then
        err "Install directory missing: ${INSTALL_DIR}"
        missing=1
    fi

    if [ ! -f "${INSTALL_DIR}/.env.example" ]; then
        err "Missing file: ${INSTALL_DIR}/.env.example"
        missing=1
    fi

    if [ ! -f "${INSTALL_DIR}/server/index.js" ]; then
        err "Missing file: ${INSTALL_DIR}/server/index.js"
        missing=1
    fi

    if [ "$missing" -ne 0 ]; then
        err "Repository appears incomplete. Try removing and re-running:"
        err "  rm -rf ${INSTALL_DIR}"
        err "  bash install.sh"
        exit 1
    fi

    ok "Install directory verified: ${INSTALL_DIR}"
}

# ─── Setup .env ───────────────────────────────────────────────────────────────
setup_env() {
    if [ -f "${INSTALL_DIR}/.env" ]; then
        ok ".env already exists, skipping"
        return 0
    fi

    log "Creating .env from .env.example..."
    cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"

    if command -v openssl > /dev/null 2>&1; then
        local jwt_secret
        jwt_secret=$(openssl rand -hex 64)
        sed -i "s/your_super_secret_jwt_key_change_this_in_production/${jwt_secret}/" "${INSTALL_DIR}/.env"
        ok "Generated random JWT secret"
    else
        warn "openssl not found - please set JWT_SECRET manually in ${INSTALL_DIR}/.env"
    fi

    ok ".env created. Review and set ANTHROPIC_API_KEY if you want AI features."
}

# ─── Install server deps ──────────────────────────────────────────────────────
install_server() {
    log "Installing server dependencies..."
    cd "${INSTALL_DIR}"
    npm install --production >> "$LOG_FILE" 2>&1 || {
        err "npm install --production failed in ${INSTALL_DIR}"
        err "Check ${LOG_FILE} for details."
        exit 1
    }
    ok "Server dependencies installed"
}

# ─── Install & build client ───────────────────────────────────────────────────
install_client() {
    if [ ! -d "${INSTALL_DIR}/client" ]; then
        warn "No client/ directory found - skipping frontend build"
        return 0
    fi

    log "Installing client dependencies..."
    cd "${INSTALL_DIR}/client"
    npm install >> "$LOG_FILE" 2>&1 || {
        err "npm install failed in ${INSTALL_DIR}/client"
        err "Check ${LOG_FILE} for details."
        exit 1
    }

    log "Building client (this may take a moment)..."
    npm run build >> "$LOG_FILE" 2>&1 || {
        err "npm run build failed in ${INSTALL_DIR}/client"
        err "Check ${LOG_FILE} for details."
        exit 1
    }
    ok "Client built successfully"
}

# ─── pm2 startup ─────────────────────────────────────────────────────────────
setup_pm2_startup() {
    echo ""
    read -rp "Set up pm2 to auto-start NixPanel on boot? [y/N] " SETUP_PM2 </dev/tty || SETUP_PM2="n"
    if [ "${SETUP_PM2}" != "y" ] && [ "${SETUP_PM2}" != "Y" ]; then
        log "Skipping pm2 startup setup."
        log "To set up later:"
        log "  cd ${INSTALL_DIR} && pm2 start server/index.js --name nixpanel"
        log "  pm2 save && pm2 startup"
        return 0
    fi

    cd "${INSTALL_DIR}"
    pm2 start server/index.js --name nixpanel >> "$LOG_FILE" 2>&1 || {
        err "pm2 start failed. Check ${LOG_FILE} for details."
        exit 1
    }
    pm2 save >> "$LOG_FILE" 2>&1 || true

    local startup_cmd
    startup_cmd=$(pm2 startup 2>&1 | grep "sudo env" || true)
    if [ -n "$startup_cmd" ]; then
        log "Configuring pm2 startup..."
        eval "$startup_cmd" >> "$LOG_FILE" 2>&1 || warn "pm2 startup config failed - run manually: pm2 startup"
    fi

    ok "pm2 configured - NixPanel will start automatically on boot"
    log "Manage with: pm2 {start|stop|restart|status|logs} nixpanel"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
    > "$LOG_FILE"

    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║     NixPanel Installation Script     ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
    echo ""
    log "Install log  : ${LOG_FILE}"
    log "Install dir  : ${INSTALL_DIR}"
    echo ""

    check_root
    detect_os
    install_system_deps

    # Clone BEFORE any file operations that depend on repo contents
    clone_repo
    verify_install_dir

    cd "${INSTALL_DIR}"

    setup_env
    install_server
    install_client
    setup_pm2_startup

    local port admin_user
    port=$(grep -E "^PORT=" "${INSTALL_DIR}/.env" 2>/dev/null | cut -d= -f2 || echo "3001")
    admin_user=$(grep -E "^ADMIN_USERNAME=" "${INSTALL_DIR}/.env" 2>/dev/null | cut -d= -f2 || echo "admin")

    echo ""
    echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${GREEN}║         Installation Complete!           ║${NC}"
    echo -e "${BOLD}${GREEN}╠══════════════════════════════════════════╣${NC}"
    echo -e "${BOLD}${GREEN}║                                          ║${NC}"
    echo -e "${BOLD}${GREEN}║  Dir:    ${INSTALL_DIR}              ║${NC}"
    echo -e "${BOLD}${GREEN}║                                          ║${NC}"
    echo -e "${BOLD}${GREEN}║  Start:  pm2 start server/index.js       ║${NC}"
    echo -e "${BOLD}${GREEN}║  Or:     node server/index.js            ║${NC}"
    echo -e "${BOLD}${GREEN}║                                          ║${NC}"
    printf "${BOLD}${GREEN}║  URL:    http://localhost:%-16s║${NC}\n" "${port}"
    printf "${BOLD}${GREEN}║  User:   %-32s║${NC}\n" "${admin_user}"
    echo -e "${BOLD}${GREEN}║  Pass:   (set ADMIN_PASSWORD in .env)    ║${NC}"
    echo -e "${BOLD}${GREEN}║                                          ║${NC}"
    echo -e "${BOLD}${GREEN}║  ! Change default password on first      ║${NC}"
    echo -e "${BOLD}${GREEN}║    login!                                ║${NC}"
    echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
    echo ""
}

main "$@"
