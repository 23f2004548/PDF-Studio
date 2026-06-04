# Contributing to PDF Studio 📄

Thank you for your interest in contributing to PDF Studio! We welcome all contributions — bug reports, feature suggestions, documentation improvements, and code changes.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Report a Bug](#how-to-report-a-bug)
- [How to Propose a Feature](#how-to-propose-a-feature)
- [Local Setup Guide](#local-setup-guide)
- [Contribution Workflow](#contribution-workflow)
- [Commit Message Convention](#commit-message-convention)
- [Code Standards](#code-standards)
- [Submitting a Pull Request](#submitting-a-pull-request)

---

## Code of Conduct

Please be respectful and considerate in all interactions. We are committed to providing a welcoming environment for everyone.

---

## How to Report a Bug

1. Check [existing issues](https://github.com/23f2004548/PDF-Studio/issues) to avoid duplicates.
2. Open a new issue and include:
   - A clear, descriptive title.
   - Steps to reproduce the bug.
   - Expected vs. actual behavior.
   - Your OS and Node.js version.
   - Screenshots or logs if applicable.

---

## How to Propose a Feature

1. Open an issue with the `[Feature]` prefix in the title.
2. Describe the problem your feature solves.
3. Outline your proposed implementation if possible.
4. Wait for maintainer feedback before starting work.

---

## Local Setup Guide

### Prerequisites

- **Node.js v22 or later** — [Download here](https://nodejs.org/)
- **Git**

### Running the Desktop App (`ui/`)

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/PDF-Studio.git
cd PDF-Studio

# Navigate to the desktop app
cd ui

# Install dependencies
npm install

# Start the Electron dev server
npm run dev
```

### Running the Marketing Website (`website/`)

Simply open `website/index.html` directly in any browser — no build step required.

---

## Contribution Workflow

1. **Fork** the repository and clone your fork locally.
2. **Sync** your fork with the upstream main branch before starting:
```bash
   git remote add upstream https://github.com/23f2004548/PDF-Studio.git
   git fetch upstream
   git rebase upstream/main
```
3. **Create a descriptive branch** from `main`:
```bash
   git checkout -b feature/your-feature-name
   # Examples:
   # feature/dark-mode
   # fix/zoom-crash-on-linux
   # docs/update-readme
```
4. Make your changes, commit, and push to your fork.
5. Open a Pull Request against the `main` branch.

---

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | When to use |
|--------|-------------|
| `feat:` | A new feature |
| `fix:` | A bug fix |
| `docs:` | Documentation changes only |
| `style:` | Code formatting, no logic change |
| `refactor:` | Code restructuring, no new features |
| `test:` | Adding or updating tests |
| `chore:` | Build process or tooling changes |

**Examples:**

feat: add keyboard shortcut for full-screen mode 
fix: resolve crash when opening password-protected PDFs
docs: add CONTRIBUTING.md guidelines

---

## Code Standards

- **Formatter**: Use [Prettier](https://prettier.io/) for consistent formatting.
- **Linter**: Follow the ESLint config present in `ui/`.
- **TypeScript**: All new code in `ui/src/` must be written in TypeScript.
- **Vue Components**: Use the Composition API (`<script setup>`).
- Run a quick check before committing:
```bash
  cd ui
  npm run lint
```

---

## Submitting a Pull Request

1. Ensure your branch is up-to-date with `upstream/main`.
2. Write a clear PR title following the commit convention (e.g. `docs: add CONTRIBUTING.md`).
3. Fill out the PR description:
   - **What** was changed and **why**.
   - Link the related issue (e.g. `Closes #3`).
   - Add screenshots for any UI changes.
4. Mark the PR as **Draft** if it's still a work-in-progress.
5. Once approved, a maintainer will merge it.

---

## Thank You! 🙌

Every contribution matters. If you have any questions, feel free to open a discussion or comment on the relevant issue.