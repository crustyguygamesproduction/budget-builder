# Money Hub

AI-powered personal finance system that turns raw financial data into structured insights, trends, and intelligent guidance.

---

## ✨ Core Features

- Unified financial dashboard with real-time state awareness  
- Intelligent transaction and statement analysis  
- Calendar-based financial rhythm tracking  
- Automated duplicate, overlap, and confidence detection on imports  
- Signal detection for debt, spending patterns, and financial behaviour  
- AI-ready coaching context built from real user data  

---

## 🧠 What Makes It Different

Money Hub is not just a budgeting tool.

It focuses on:
- Understanding financial behaviour, not just tracking numbers  
- Turning messy inputs (bank statements, receipts) into structured signals  
- Building a foundation for AI-driven financial coaching  

---

## 🚀 Live Demo

https://budget-builder-o0dhsumfn-crustyguygamesproductions-projects.vercel.app/

---

SCREENSHOTS WILL GO HERE

---

## 🛠 Tech Stack

- React + Vite  
- Supabase (auth + database)  
- Vercel (deployment)

---

## ⚡ Quick Start

npm install  
npm run dev  

---

## First-Time User Flow

Money Hub is designed for people who want better finances without doing constant money admin.

1. Install/open the app.
2. Create an account.
3. Upload CSV bank statements. Multiple files are fine; duplicate and overlap checks help avoid importing the same transactions twice.
4. Open Calendar to check bills, rent, subscriptions, debt payments, missing bills, and past spending.
5. Set one goal, starting with safety before growth.
6. Ask the AI Coach for a plain-English overview, spending personality read, or simple plan.

Setup runs on first login for each account, can be replayed from More/Settings, and users can delete all data or selected uploaded months if they want to restart.

---

## ✅ Pre-Push Checks

npm run check  

Runs linting and a production build.

---

## Privacy And Trust

Money Hub handles sensitive financial data: statements, receipts, documents, transactions, and AI money context.

- The app includes a user-facing Privacy page in `src/pages/PrivacyPage.jsx`.
- Uploaded receipt and document files should use private Supabase storage paths and short-lived signed links.
- AI features receive focused financial context so answers can be useful without exposing unrelated app state.
- User financial data is not positioned for advertising or resale.
- Supabase service-role keys must never be exposed in Vite client env vars.

---

## 🧠 Architecture Overview

### Core App
- src/App.jsx  
  Handles session, Supabase loading, shared state, and routing  
- src/lib/moneyUnderstanding.js
  Builds the shared interpreted money layer
- src/lib/appMoneyModel.js
  Turns moneyUnderstanding into page-friendly income, bills, spending, savings, warnings, and AI context

### Intelligence Layer
- src/lib/dashboardIntelligence.js → summaries, freshness, trends  
- src/lib/statementSignals.js → behavioural signals and detection  
- src/lib/calendarIntelligence.js → financial rhythm + timeline logic  
- src/lib/importAnalysis.js → duplicate detection, overlap, confidence scoring  
- src/lib/coachContext.js → builds structured AI-ready financial context  

### Utilities
- src/lib/finance.js → shared transaction, money, and date helpers  

### UI Layer
- src/pages/*Page.jsx → workflows and page logic  
- src/components/onboarding/* → first-run guided setup and replay
- src/styles.js / src/lib/styleHelpers.js → design system  

---

## 📚 Docs

- `AGENTS.md` - coding rules for future Codex sessions
- `docs/CODEX_CONTEXT.md` - current source-of-truth project context
- `docs/maintainer-map.md` - file map and where to make changes
- `docs/next-refactor-plan.md` - next safe maintainability slices
- `docs/launch-readiness-checklist.md` - manual-upload launch checklist
- `docs/production-readiness.md` - deployment, Supabase, Vercel and security notes
- `docs/BANK_FEED_GOCARDLESS_PLAN.md` - future UK live bank feed plan

---

## 🚧 Roadmap

- AI transaction categorisation  
- Receipt intelligence + search  
- Personal financial coaching layer  
- Predictive insights and forecasting  

---

## 💡 Vision

Money Hub aims to become a system that understands your financial life, not just records it.

The long-term goal is to provide intelligent, context-aware financial guidance powered by real behavioural data.
