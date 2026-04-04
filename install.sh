#!/usr/bin/env bash
# NixPanel Installer (Binary Edition)
# Supports: AlmaLinux 9, Rocky Linux 9, RHEL 9, Ubuntu 22.04/24.04, Debian 11/12
# Usage: bash install.sh

set -eo pipefail
set +u

# ─── Constants ────────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/nixpanel"
RELEASES_URL="https://github.com/NixPanel/nixpanel/releases/latest/download"
BINARY_NAME="nixpanel-linux-x64"
LOG_FILE="/tmp/nixpanel-install.log"

# ─── Global state ─────────────────────────────────────────────────────────────
ADMIN_USERNAME=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""   # kept in memory only; never logged or displayed after setup
DOMAIN=""
SERVER_IP=""

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

# ─── Install Node.js 20.x (required for PM2) ─────────────────────────────────
install_nodejs() {
    arrow "nodejs not found - installing Node.js 20.x via NodeSource..."

    if [ "$OS_FAMILY" = "rhel" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >> "$LOG_FILE" 2>&1 || {
            err "NodeSource setup script failed."
            exit 1
        }
        dnf install -y nodejs >> "$LOG_FILE" 2>&1 || {
            err "dnf install nodejs failed after NodeSource setup."
            exit 1
        }
    else
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >> "$LOG_FILE" 2>&1 || {
            err "NodeSource setup script failed."
            exit 1
        }
        DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >> "$LOG_FILE" 2>&1 || {
            err "apt-get install nodejs failed after NodeSource setup."
            exit 1
        }
    fi

    if ! command -v node > /dev/null 2>&1; then
        err "Node.js installation completed but 'node' command not found."
        exit 1
    fi

    local ver
    ver=$(node --version)
    ok "nodejs ${ver} installed successfully"
}

# ─── Dependency checker / installer ──────────────────────────────────────────
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
        exit 1
    }
    dnf makecache -y >> "$LOG_FILE" 2>&1 || true
    ok "epel-release installed successfully"
}

# ─── Install pm2 ─────────────────────────────────────────────────────────────
install_pm2() {
    npm install -g pm2 >> "$LOG_FILE" 2>&1 || {
        err "npm install -g pm2 failed."
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

    check_dep "curl"    "curl"    "curl"
    check_dep "wget"    "wget"    "wget"
    check_dep "openssl" "openssl" "openssl"

    # Node.js 20.x (required for PM2)
    if command -v node > /dev/null 2>&1; then
        local major
        major=$(node -e "console.log(parseInt(process.version.slice(1).split('.')[0]))")
        if [ "$major" -ge 18 ]; then
            ok "nodejs $(node --version) already installed"
        else
            warn "nodejs $(node --version) found but version < 18 - upgrading..."
            install_nodejs
        fi
    else
        install_nodejs
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

# ─── Create install directory ─────────────────────────────────────────────────
create_install_dir() {
    if [ -d "$INSTALL_DIR" ]; then
        ok "Install directory already exists: ${INSTALL_DIR}"
    else
        mkdir -p "$INSTALL_DIR"
        ok "Created install directory: ${INSTALL_DIR}"
    fi
}

# ─── Download NixPanel binary ─────────────────────────────────────────────────
download_binary() {
    local binary_url="${RELEASES_URL}/${BINARY_NAME}"
    local dest="${INSTALL_DIR}/nixpanel"

    if [ -f "$dest" ]; then
        log "Existing binary found at ${dest}"
        log "Downloading latest version..."
    else
        log "Downloading NixPanel binary..."
    fi

    arrow "Source: ${binary_url}"
    curl -fsSL --progress-bar "$binary_url" -o "$dest" >> "$LOG_FILE" 2>&1 || {
        err "Failed to download binary from:"
        err "  ${binary_url}"
        err "Check network connectivity or download manually."
        exit 1
    }

    chmod +x "$dest"
    ok "Binary downloaded: ${dest}"
}

# ─── Download .env.example ────────────────────────────────────────────────────
download_env_example() {
    local env_example="${INSTALL_DIR}/.env.example"

    if [ -f "$env_example" ]; then
        ok ".env.example already present"
        return 0
    fi

    arrow "Downloading .env.example..."
    curl -fsSL "${RELEASES_URL}/.env.example" -o "$env_example" >> "$LOG_FILE" 2>&1 || {
        err "Failed to download .env.example"
        exit 1
    }
    ok ".env.example downloaded"
}

# ─── Safe .env writer (no sed substitution; handles special chars in values) ──
write_env_var() {
    local key="$1" val="$2"
    sed -i "/^${key}=/d" "${INSTALL_DIR}/.env"
    printf '%s=%s\n' "$key" "$val" >> "${INSTALL_DIR}/.env"
}

# ─── Setup .env ───────────────────────────────────────────────────────────────
setup_env() {
    if [ -f "${INSTALL_DIR}/.env" ]; then
        ok ".env already exists, skipping base setup"
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

    ok ".env created"
}

# ─── Collect admin account details ───────────────────────────────────────────
setup_admin_account() {
    echo ""
    echo -e "${BOLD}┌─────────────────────────────────────┐${NC}"
    echo -e "${BOLD}│        Create Admin Account         │${NC}"
    echo -e "${BOLD}└─────────────────────────────────────┘${NC}"

    read -rp "Admin username [admin]: " ADMIN_USERNAME </dev/tty || ADMIN_USERNAME=""
    ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
    ADMIN_USERNAME="${ADMIN_USERNAME// /}"

    while true; do
        read -rp "Admin email: " ADMIN_EMAIL </dev/tty || ADMIN_EMAIL=""
        ADMIN_EMAIL="${ADMIN_EMAIL// /}"
        [ -n "$ADMIN_EMAIL" ] && break
        warn "Email address is required."
    done

    while true; do
        read -rsp "Admin password (min 8 chars): " ADMIN_PASSWORD </dev/tty || ADMIN_PASSWORD=""
        echo ""
        if [ "${#ADMIN_PASSWORD}" -lt 8 ]; then
            warn "Password must be at least 8 characters. Try again."
            continue
        fi
        local pw_confirm
        read -rsp "Confirm password: " pw_confirm </dev/tty || pw_confirm=""
        echo ""
        if [ "$ADMIN_PASSWORD" = "$pw_confirm" ]; then
            unset pw_confirm
            break
        fi
        warn "Passwords do not match. Try again."
        unset pw_confirm
    done

    write_env_var "ADMIN_USERNAME" "$ADMIN_USERNAME"
    write_env_var "ADMIN_EMAIL"    "$ADMIN_EMAIL"
    write_env_var "ADMIN_PASSWORD" "$ADMIN_PASSWORD"

    ok "Admin account configured"
}

# ─── pm2 startup ─────────────────────────────────────────────────────────────
setup_pm2_startup() {
    echo ""
    read -rp "Set up pm2 to auto-start NixPanel on boot? [y/N] " SETUP_PM2 </dev/tty || SETUP_PM2="n"
    if [ "${SETUP_PM2}" != "y" ] && [ "${SETUP_PM2}" != "Y" ]; then
        log "Skipping pm2 startup setup."
        log "To set up later:"
        log "  pm2 start ${INSTALL_DIR}/nixpanel --name nixpanel"
        log "  pm2 save && pm2 startup"
        return 0
    fi

    # Stop existing instance if running
    pm2 delete nixpanel >> "$LOG_FILE" 2>&1 || true

    pm2 start "${INSTALL_DIR}/nixpanel" --name nixpanel >> "$LOG_FILE" 2>&1 || {
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

# ─── Ask for domain name ──────────────────────────────────────────────────────
ask_domain() {
    echo ""
    read -rp "Enter your domain name (leave blank to use IP address): " DOMAIN </dev/tty || DOMAIN=""
    DOMAIN="${DOMAIN// /}"

    if [ -z "$DOMAIN" ]; then
        SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "")
        if [ -z "$SERVER_IP" ]; then
            SERVER_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "localhost")
        fi
        log "No domain provided - will use IP: ${SERVER_IP}"
    else
        ok "Domain: ${DOMAIN}"
    fi
}

# ─── Install and configure Nginx reverse proxy ───────────────────────────────
setup_nginx() {
    if ! command -v nginx > /dev/null 2>&1; then
        arrow "nginx not found - installing..."
        pkg_install nginx || {
            err "Failed to install nginx. Check ${LOG_FILE} for details."
            exit 1
        }
        ok "nginx installed"
    else
        ok "nginx already installed"
    fi

    local port
    port=$(grep -E "^PORT=" "${INSTALL_DIR}/.env" 2>/dev/null | cut -d= -f2 || echo "3001")

    local server_name
    if [ -n "$DOMAIN" ]; then
        server_name="$DOMAIN"
    else
        server_name="_"
    fi

    local conf_file
    if [ "$OS_FAMILY" = "rhel" ]; then
        conf_file="/etc/nginx/conf.d/nixpanel.conf"
    else
        conf_file="/etc/nginx/sites-available/nixpanel"
    fi

    log "Writing nginx reverse proxy config to ${conf_file}..."
    cat > "$conf_file" << 'NGINXEOF'
server {
    listen 80;
    server_name NIXPANEL_SERVER_NAME;

    location / {
        proxy_pass http://127.0.0.1:NIXPANEL_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINXEOF
    sed -i "s/NIXPANEL_SERVER_NAME/${server_name}/" "$conf_file"
    sed -i "s/NIXPANEL_PORT/${port}/" "$conf_file"

    if [ "$OS_FAMILY" = "debian" ]; then
        ln -sf "$conf_file" /etc/nginx/sites-enabled/nixpanel 2>/dev/null || true
        rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    fi

    nginx -t >> "$LOG_FILE" 2>&1 || {
        err "nginx config test failed. Check ${LOG_FILE} for details."
        exit 1
    }

    systemctl enable nginx >> "$LOG_FILE" 2>&1 || true
    systemctl restart nginx >> "$LOG_FILE" 2>&1 || {
        err "Failed to start nginx. Check: systemctl status nginx"
        exit 1
    }

    ok "nginx configured and started"
}

# ─── Open firewall ports ──────────────────────────────────────────────────────
configure_firewall() {
    if command -v firewall-cmd > /dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
        log "Configuring firewalld..."
        firewall-cmd --permanent --add-port=80/tcp  >> "$LOG_FILE" 2>&1 || true
        firewall-cmd --permanent --add-port=443/tcp >> "$LOG_FILE" 2>&1 || true
        firewall-cmd --permanent --add-port=3001/tcp >> "$LOG_FILE" 2>&1 || true
        firewall-cmd --reload >> "$LOG_FILE" 2>&1 || true
        ok "Firewall configured (firewalld)"
    elif command -v ufw > /dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
        log "Configuring ufw..."
        ufw allow 80/tcp   >> "$LOG_FILE" 2>&1 || true
        ufw allow 443/tcp  >> "$LOG_FILE" 2>&1 || true
        ufw allow 3001/tcp >> "$LOG_FILE" 2>&1 || true
        ok "Firewall configured (ufw)"
    else
        warn "No active firewall detected (firewalld/ufw) - skipping"
    fi
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

    create_install_dir
    download_binary
    download_env_example

    setup_env
    setup_admin_account
    ask_domain
    setup_nginx
    configure_firewall
    setup_pm2_startup

    local port access_url
    port=$(grep -E "^PORT=" "${INSTALL_DIR}/.env" 2>/dev/null | cut -d= -f2 || echo "3001")

    if [ -n "$DOMAIN" ]; then
        access_url="https://${DOMAIN}"
    else
        access_url="http://${SERVER_IP:-localhost}:${port}"
    fi

    echo ""
    echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${GREEN}║         Installation Complete!           ║${NC}"
    echo -e "${BOLD}${GREEN}╠══════════════════════════════════════════╣${NC}"
    echo -e "${BOLD}${GREEN}║                                          ║${NC}"
    printf "${BOLD}${GREEN}║  URL:   %-33s║${NC}\n" "${access_url}"
    printf "${BOLD}${GREEN}║  User:  %-33s║${NC}\n" "${ADMIN_USERNAME}"
    printf "${BOLD}${GREEN}║  Email: %-33s║${NC}\n" "${ADMIN_EMAIL}"
    echo -e "${BOLD}${GREEN}║                                          ║${NC}"
    echo -e "${BOLD}${GREEN}║  Keep your password safe!                ║${NC}"
    echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    if [ -n "$DOMAIN" ]; then
        warn "SSL not yet configured. Run: certbot --nginx -d ${DOMAIN}"
    fi
}

main "$@"
