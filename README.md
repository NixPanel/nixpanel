# NixPanel

A modern, open-core web-based Linux administration panel. The core is free and open source. Advanced features require a Pro license.

## Features

### Free vs Pro

| Feature | Free | Pro |
|---------|------|-----|
| Dashboard & System Overview | ✅ | ✅ |
| Package Management | ✅ | ✅ |
| User Management | ✅ | ✅ |
| Service Manager | ✅ | ✅ |
| Log Viewer | ✅ | ✅ |
| File Browser | ✅ | ✅ |
| Settings | ✅ | ✅ |
| AI Assistant (Chat) | ➖ | ✅ |
| AI Troubleshoot & Diagnostics | ➖ | ✅ |
| Firewall Management (UFW/iptables) | ➖ | ✅ |
| SSH Key Management | ➖ | ✅ |
| SSL Certificate Manager | ➖ | ✅ |
| Backup & Restore | ➖ | ✅ |
| Process Manager | ➖ | ✅ |
| Network Diagnostics | ➖ | ✅ |
| Filesystem Inspector | ➖ | ✅ |
| Security Hardening Center | ➖ | ✅ |
| Automation Center | ➖ | ✅ |
| Cron Job Manager | ➖ | ✅ |

## Installation

### Requirements

- Node.js 18+
- Linux (Debian/Ubuntu/RHEL/NixOS)
- npm

### Quick Start

```bash
git clone https://github.com/nixpanel/nixpanel.git
cd nixpanel
cp .env.example .env
# Edit .env - set JWT_SECRET, ADMIN_PASSWORD, and optionally ANTHROPIC_API_KEY

npm install
cd client && npm install && npm run build && cd ..
node server/index.js
```

Open `http://localhost:3001` and log in with your admin credentials.

### Environment Variables

```env
PORT=3001
JWT_SECRET=your_secret_here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme123
ANTHROPIC_API_KEY=sk-ant-...   # Required for AI features (Pro)
DB_PATH=./nixpanel.db
```

## Getting a Pro License

Visit [nixpanel.io/pricing](https://nixpanel.io/pricing) to subscribe. After purchasing, you receive a license key in the format `NIXP-XXXX-XXXX-XXXX-XXXX`.

To activate:
1. Log in as admin
2. Navigate to **Upgrade** in the sidebar
3. Enter your license key and click **Activate License**

Pro features are unlocked immediately. Activation works offline if the license server is unreachable.

## Contributing

Contributions to the free tier features are welcome. Pro feature contributions require a CLA.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes
4. Open a pull request

## License

- **Core (free features):** MIT License
- **Pro features:** Commercial license - see [nixpanel.io/license](https://nixpanel.io/license)
