# ASU Med Materials - منصة مصادر طب عين شمس

The all-in-one directory for Ain Shams University (FOM-ASU) medical students to share and access study materials, central batch Google Drives, Telegram channels, YouTube playlists, summaries, and exam recalls.

---

> This website was built by the help of Google Antigravity cli

## 🌟 Features / المميزات

- **Multistage Year & Module Selection (تحديد متعدد المراحل)**: Prompts students on first visit to select their academic year and module, storing their choice locally in `localStorage` for instant personalized access.
- **Grouped Study Materials (تصنيف منظم للمصادر)**: Categorizes materials into functional learning groups: Central Drives, Lectures, Practical Labs & Dissections, Summaries & Notes, and Past Exams.
- **Per-Subject Dedicated Pages (صفحات وتصفية مستقلة للمواد)**: Every module features dedicated subpages for its curriculum subjects (e.g. `/module/year1-foundation/medical-biochemistry`), allowing targeted access to specific disciplines.
- **Arabic-First with Technical English**: Intuitive Arabic RTL navigation with standardized English terminology for subjects, module codes, and resource platforms.
- **Default White Theme**: Crisp, high-contrast light theme by default, with an optional dark mode toggle.
- **Instant Search & Multi-filter**: Live keyword filtering across all modules, subjects, and resource types.
- **Direct Resource Submission**: Fast on-page form for students to submit new materials directly through the serverless Google Sheets integration without leaving the website.
- **Student Feedback & Suggestions (الآراء والملاحظات)**: Dedicated form (`/feedback`) connecting directly to Google Sheets via serverless webhooks for ideas, broken link reports, and technical issues.
- **Offline & PWA Ready**: Bookmark favorite resources locally and access them without an active connection.
- **Quote of the day popup**: A popup with a quote or a meme for the users.

---

## 🚀 Quick Start

Ensure you have [Node.js](https://nodejs.org/) (>= 22.12.0) and [pnpm](https://pnpm.io/) installed.

```bash
# Install dependencies
pnpm install

# Start local development server (http://localhost:4321)
pnpm dev

# Typecheck and validate code
pnpm astro check

# Build production bundle
pnpm build
```

---

## 📚 Documentation

For deeper details on system design, component architecture, and the curriculum layout:

- [System Architecture](file:///workspaces/asu_med_materials/docs/ARCHITECTURE.md) - Project structure, state management, and data flow.
- [UI Components Specification](file:///workspaces/asu_med_materials/docs/COMPONENTS.md) - Component inventory, props, and design guidelines.
- [Google Sheets Webhook Setup](file:///workspaces/asu_med_materials/docs/FEEDBACK_SETUP.md) - Deploying Apps Script webhooks for feedback and submissions.
- [Curriculum Mapping](file:///workspaces/asu_med_materials/docs/CURRICULUM_STRUCTURE.md) - Ain Shams University 5-year modular curriculum breakdown.
- [Development Guidelines](file:///workspaces/asu_med_materials/AGENTS.md) - Code quality and contributor rules.

---

## 🤝 Contributing / المشاركة

Have a helpful drive, summary, lecture playlist, or batch channel? Contributions are welcome!
Visit the [/contribute](file:///workspaces/asu_med_materials/src/pages/contribute.astro) page on the website to submit materials directly, and your name/credits will appear on the resource cards.
