# Security Policy

## Supported Versions

Only the latest release or active `main` branch of MFLedger is supported for security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Architecture & Data Privacy Model

MFLedger is designed as a **local-first, privacy-preserving application**:
- **Client-Side Only**: All database operations (Dexie / IndexedDB), financial records, CAS parses, and calculations occur entirely within your browser.
- **Zero Remote Storage**: No user financial data, credentials, or portfolio balances are transmitted to or stored on external servers.
- **Zero Analytics Tracking**: No tracking pixels or telemetry that transmit financial identities or account balances.

## Reporting a Vulnerability

We take the security and privacy of MFLedger seriously. If you discover a security vulnerability or sensitive data leak:

1. **Do not create a public issue** on GitHub.
2. Report the vulnerability privately via **GitHub Private Vulnerability Reporting** on the repository's **Security** tab:
   - Go to the repository on GitHub.
   - Click on the **Security** tab.
   - Under **Advisories**, click **Report a vulnerability**.
3. Alternatively, contact the maintainer directly via email or private channel.

### What to Include in Your Report
- A detailed description of the vulnerability.
- Steps to reproduce or proof-of-concept (PoC).
- Potential impact of the issue (e.g., local storage tampering, XSS, parser vulnerability).
- Any suggested fixes or mitigations.

### Response Timeline
- **Acknowledgement**: Within 48 hours.
- **Assessment & Fix**: High/Critical vulnerabilities will be addressed promptly with an advisory and patched release.
