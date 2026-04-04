#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}=== NixPanel Deploy ===${NC}"
echo ""

# Step 1: Check for uncommitted changes
if [[ -n "$(git status --porcelain)" ]]; then
  echo -e "${YELLOW}Uncommitted changes detected:${NC}"
  git status --short
  echo ""
  read -rp "Commit message: " COMMIT_MSG
  if [[ -z "$COMMIT_MSG" ]]; then
    echo -e "${RED}Commit message cannot be empty.${NC}"
    exit 1
  fi
  git add .
  git commit -m "$COMMIT_MSG"
  git push origin main
  echo -e "${GREEN}Changes committed and pushed.${NC}"
else
  echo -e "${GREEN}Working tree clean, nothing to commit.${NC}"
fi
echo ""

# Step 2: Build the React client
echo -e "${BOLD}Building React client...${NC}"
cd client && npm run build
cd "$REPO_DIR"
echo -e "${GREEN}Client build complete.${NC}"
echo ""

# Step 3: Commit built dist
if [[ -n "$(git status --porcelain client/dist/)" ]]; then
  echo -e "${BOLD}Committing built dist...${NC}"
  git add client/dist/
  git commit -m "Rebuild client dist"
  git push origin main
  echo -e "${GREEN}Dist committed and pushed.${NC}"
else
  echo -e "${GREEN}No changes in client/dist/, skipping dist commit.${NC}"
fi
echo ""

# Step 4: Create release package
VERSION="$(node -p "require('./package.json').version")"
RELEASE_NAME="nixpanel-v${VERSION}"
RELEASE_DIR="releases/${RELEASE_NAME}"

echo -e "${BOLD}Creating release package ${RELEASE_NAME}...${NC}"
mkdir -p "$RELEASE_DIR"

# Copy key files
cp -r server "$RELEASE_DIR/"
cp -r client/dist "$RELEASE_DIR/client/"
cp package.json "$RELEASE_DIR/"
cp package-lock.json "$RELEASE_DIR/"
cp install.sh "$RELEASE_DIR/"
cp README.md "$RELEASE_DIR/"
[[ -f .env.example ]] && cp .env.example "$RELEASE_DIR/"

# Create tarball
TARBALL="releases/${RELEASE_NAME}.tar.gz"
tar -czf "$TARBALL" -C releases "$RELEASE_NAME"

# Generate SHA256 checksum
CHECKSUM="$(sha256sum "$TARBALL" | awk '{print $1}')"
echo "$CHECKSUM  ${RELEASE_NAME}.tar.gz" > "releases/${RELEASE_NAME}.tar.gz.sha256"

# Clean up staging dir
rm -rf "$RELEASE_DIR"

echo -e "${GREEN}Release package created.${NC}"
echo ""

# Step 5: Summary
REMOTE_URL="$(git remote get-url origin 2>/dev/null || echo 'unknown')"

echo -e "${BOLD}${CYAN}=== Deploy Summary ===${NC}"
echo -e "  GitHub repo:     ${REMOTE_URL}"
echo -e "  Release package: ${TARBALL}"
echo -e "  SHA256:          ${CHECKSUM}"
echo ""
echo -e "${YELLOW}${BOLD}Reminder:${NC} Update your VPS with:"
echo -e "  ${CYAN}git pull origin main${NC}"
echo ""
echo -e "${GREEN}${BOLD}Done!${NC}"
