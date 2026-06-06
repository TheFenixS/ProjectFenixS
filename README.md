# Fenix Inventory Tracker Frontend

React 18 + Vite frontend for Fenix CS2 Inventory Tracker.

## Features
- Real-time Steam inventory tracking
- Item filtering & search
- Price tracking (CNY → USD conversion)
- Responsive dark UI

## Setup

```bash
cd frontend
npm install
npm run dev
```

## Build for Vercel

```bash
npm run build
```

Output in `dist/`

## Environment
- `VITE_INVENTORY_API`: Inventory backend URL (defaults to `http://localhost:8000`)
- `VITE_PUMP_API`: Pump detector backend URL (defaults to `http://localhost:8001`)
- `VITE_PORTFOLIO_API`: Portfolio backend URL (defaults to `http://localhost:8002`)
