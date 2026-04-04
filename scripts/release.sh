#!/usr/bin/env bash
# NixPanel Release Builder
# Usage: bash scripts/release.sh
# Builds the React client, compiles to a pkg binary, and packages a release tarball.

set -euo pipefail

# ─── Resolve repo root ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# ─── Version ─────────────────────────────────────────────────────────────────
VERSION=$(node -e "console.log(require('./package.json').version)" 2>/dev/null)
if [ -z "$VERSION" ]; then
    echo "[error] Could not read version from package.json" >&2
    exit 1
fi

RELEASE_NAME="nixpanel-v${VERSION}-linux-x64"
RELEASE_DIR="release/${RELEASE_NAME}"
TARBALL="release/${RELEASE_NAME}.tar.gz"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     NixPanel Release Builder         ║"
echo "╠══════════════════════════════════════╣"
printf "║  Version : %-27s║\n" "v${VERSION}"
printf "║  Output  : %-27s║\n" "${TARBALL}"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── Step 1: Build React client ───────────────────────────────────────────────
echo "[1/4] Building React client..."
cd "${REPO_ROOT}/client"
npm install --silent
npm run build --silent
cd "${REPO_ROOT}"
echo "[✓] Client built"

# ─── Step 2: Install server dependencies ──────────────────────────────────────
echo "[2/4] Installing server dependencies..."
npm install --silent
echo "[✓] Dependencies installed"

# ─── Step 3: Compile binary with pkg ─────────────────────────────────────────
echo "[3/4] Compiling binary..."
mkdir -p dist
npm run build:binary
echo "[✓] Binary compiled: dist/nixpanel"

# ─── Step 4: Package release tarball ─────────────────────────────────────────
echo "[4/4] Creating release package..."
rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"

cp dist/nixpanel              "${RELEASE_DIR}/nixpanel"
cp .env.example               "${RELEASE_DIR}/.env.example"
cp install.sh                 "${RELEASE_DIR}/install.sh"

chmod +x "${RELEASE_DIR}/nixpanel"
chmod +x "${RELEASE_DIR}/install.sh"

tar -czf "${TARBALL}" -C release "${RELEASE_NAME}"
echo "[✓] Release tarball: ${TARBALL}"

# ─── Checksum ─────────────────────────────────────────────────────────────────
echo ""
echo "SHA256 checksums:"
sha256sum "${TARBALL}"
sha256sum "dist/nixpanel"

echo ""
echo "[✓] Release v${VERSION} ready"
echo "    Binary  : dist/nixpanel"
echo "    Tarball : ${TARBALL}"
