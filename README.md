# PDF Studio 📄✨

**Live Website**: [pdfstudioapp.netlify.app](https://pdfstudioapp.netlify.app/)

A premium, high-performance desktop PDF reader and studio built with **Electron**, **Vue 3**, and **TypeScript**. PDF Studio is designed from the ground up for speed, clarity, and private, local-first annotations.

---

## 🚀 Key Features

*   **⚡ Instant Search**: Keyword indexing and search lookup across pages in less than 50 milliseconds.
*   **🔍 Smart Centered Zooming**: Fluid mouse-wheel (`Ctrl` + Wheel) and laptop touchpad pinch-to-zoom centering dynamically on the viewport.
*   **✍️ Vivid Highlights**: Mark text using translucent highlights with a custom `multiply` blending layer for perfect readability.
*   **📝 Local Study Notes**: Keep detailed notes side-by-side and compile highlights/comments into a clean, printable PDF document.
*   **🔒 Private & Secure**: Zero accounts, zero ads, zero tracking. All your PDFs and annotations remain 100% local.
*   **🛠️ Crash Analytics & Updates**: Integrated Sentry error reporting and automatic update checks.

---

## 📂 Project Structure

```bash
pdfviewer/
├── .github/workflows/   # CI/CD release build automation
├── ui/                  # Desktop Electron + Vue 3 Application
│   ├── electron/        # Electron Main & Preload scripts
│   ├── src/             # Vue 3 Renderer (Components, Styles, App views)
│   └── package.json     # App dependencies & build scripts
└── website/             # Static Landing Page & Download Portal
    ├── index.html       # Responsive marketing landing page
    ├── style.css        # Premium typography & ambient animations
    └── app.js           # Dynamic OS detection & install guide modal
```

---

## 💻 Local Development

### 1. Prerequisite
Ensure you have **Node.js (v22 or later)** installed.

### 2. Desktop Application (`ui/`)
To run the desktop application locally in development mode:

```bash
# Navigate to the app folder
cd ui

# Install dependencies
npm install

# Start the Electron development server
npm run dev
```

To compile and package the production installer binary for your host operating system:

```bash
# Build production bundle and package installer
npm run build
```

---

## 🌐 Marketing Website & Download Portal (`website/`)
The `website/` directory contains a self-contained, responsive single-page landing site.

*   **OS Detection**: Automatically detects if the visitor is on Windows, macOS, or Linux, adjusting the primary download CTA.
*   **Custom Setup Guide**: Triggers an interactive step-by-step setup walkthrough showing how to bypass Windows SmartScreen warnings or macOS Gatekeeper blocks depending on the active OS.
*   **How to Test**: Simply open `website/index.html` directly in any web browser to test interactions locally.

---

## 🤖 CI/CD Build Pipeline
We have configured a **GitHub Actions workflow** located in `.github/workflows/build.yml`.

Whenever code is pushed to the `main` or `master` branch (or a tag like `v1.0.0` is pushed), GitHub Actions automatically launches 3 parallel virtual machines:
1.  **Windows Runner**: Compiles and outputs the Windows Setup `.exe`.
2.  **macOS Runner**: Compiles and outputs the macOS `.dmg` installer.
3.  **Linux Runner**: Compiles and outputs the Linux portable `.AppImage`.

The compiled binaries are uploaded as build artifacts directly on your GitHub repository's Action run page!
