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
- src/styles.js / src/lib/styleHelpers.js → design system  

---

## 📚 Docs

- AGENTS.md → system behaviour + working rules  
- docs/maintainer-map.md → full project structure  

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
