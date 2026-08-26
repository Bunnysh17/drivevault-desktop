# 🚀 DriveVault Release Notes

## 🌟 DriveVault v1.1.0 — High-Capacity Queue, Auto-Healing & Remote Deletion Sync

### 🆕 What's New in v1.1.0
- 🗑️ **Unbind All Folders**: Added a one-click "Unbind All" action with safety confirmation dialog on the Auto-Backup dashboard to detach all watched directories simultaneously without altering local files.
- ⚡ **Manual Backup Controls**: Added "Start Backup (Sync All)" and "Pause / Resume Backup" buttons in the top header toolbar, plus individual "Start Backup" buttons on folder cards.
- 📈 **100,000+ Files Queue Capacity**: Removed the 120-item limitation. The folder scanner and queue telemetry now support up to 100,000 files in large game clip and photography libraries with prefetched query optimization.
- 🔄 **Live Remote Google Drive Deletion Sync**: Deleting files on Google Drive (via web browser or mobile app) automatically cleans up database records and decrements the Total Uploaded counter.
- 🛡️ **HTTP 404 Parent Auto-Healing**: Resilient folder chain reconciliation automatically detects missing or trashed parent folders in Google Drive, clears stale caches, and recreates valid folder structures seamlessly.
- 🔕 **Notification Spam Silencing**: Muted background retry toast popups and enforced a 4-second stale notification expiration to prevent alert replaying on application launch.
- 📦 **100% Standalone Desktop Installer**: Embedded runtime eliminates any requirement for external Node.js or Python installations on user machines.

---

## 🌟 Highlights in v1.0.0

- ⚡ **Resumable Chunked Uploader Engine**: Upload massive video files in adaptive chunks (256 KB to 10 MB) with automatic session resumption and exponential backoff retry.
- 🛡️ **Zero-Loss Safety Protocol**: Files are verified against Google Drive servers before being marked eligible for cleanup. Includes a global kill-switch.
- 🎮 **Intelligent Gaming Mode**: Detects active games (Valorant, CS2, Fortnite, Apex Legends, GTA V, etc.) and throttles background bandwidth to eliminate ping spikes and FPS drops.
- 🌐 **Bandwidth & Latency Speedometer**: Real-time network speed gauge, ping tester, ISP telemetry, and configurable bandwidth rate limiting.
- 📂 **Hierarchy Preservation**: Mirrors local folder and subfolder structures into Google Drive automatically.
- 🔒 **AES-256-GCM Token Encryption**: Google OAuth tokens are securely encrypted at rest. Machine-local key management ensures tokens never leak.
- 🪄 **3-Step Setup Wizard**: Automatically scans for Medal.tv, OBS, and GeForce ShadowPlay folders on first launch.
- 🔔 **24/7 System Tray Daemon**: Runs minimized in the background with native Windows notifications and automatic boot startup.
- ⌨️ **Command Palette (`Ctrl + K`)**: Quick keyboard navigation across all views, settings, and folders.
- 🌓 **Holographic Glassmorphism UI**: Beautiful, dark-mode-first aesthetic with smooth Framer Motion micro-interactions.

---

## 📦 Release Assets

| Asset Name | Type | Size | Description |
| :--- | :--- | :--- | :--- |
| **`DriveVault-Setup-1.1.0.exe`** | NSIS Installer | ~173 MB | Complete Windows installer with Desktop shortcut, Start Menu shortcut, and embedded runtime. |
| **`DriveVault-Portable-1.1.0.exe`** | Portable Executable | ~172 MB | Standalone portable executable — run instantly without installing. |
| **`DriveVault.exe`** | Win32 Launcher | ~177 KB | Lightweight native launcher with low CPU priority enforcement. |
| **Source code (zip / tar.gz)** | Source Archive | — | Complete TypeScript, Next.js, and Electron source code. |

---

## 💻 System Requirements

- **Operating System**: Windows 10 (64-bit) or Windows 11 (64-bit)
- **RAM**: Minimum 2 GB RAM (Recommended 4 GB)
- **Disk Space**: ~250 MB free space
- **Network**: Active Internet connection for Google Drive synchronization
- **Google Account**: Any free or Google Workspace account with Google Drive storage

---

## 🚀 Quick Start Guide

1. Download **`DriveVault-Setup-1.0.0.exe`** (or **`DriveVault-Portable-1.0.0.exe`**).
2. Launch the app and follow the 60-second **Setup Wizard**.
3. Sign in to your Google Account and select your clip/recording folders.
4. DriveVault will immediately protect your workstation in the background!
