# Fenix Inventory Tracker Frontend

React 18 + Vite frontend for Fenix CS2 Inventory Tracker.

## Features
- Real-time Steam inventory tracking
- Item filtering & search
- Price tracking (CNY → USD conversion)
- Responsive dark UI

---

## 🚀 Deployment Verceliin (ohjeet)

### 1. Lisää Vercel Secrets (tee kerran)

Avaa Vercel-dashboard → **Settings → Environment Variables** ja lisää nämä kolme:

| Muuttuja | Arvo |
|---|---|
| `VITE_INVENTORY_API` | `https://sinun-käyttäjä-inventory.hf.space` |
| `VITE_PUMP_API` | `https://sinun-käyttäjä-pump.hf.space` |
| `VITE_PORTFOLIO_API` | `https://sinun-käyttäjä-portfolio.hf.space` |

> **Vinkki:** Hugging Face Space URL löytyy Spacen sivulta kohdasta "App" → osoitepalkista.

### 2. Deploy

Vercel hakee koodin suoraan GitHubista. Push main-branchiin → automaattinen deploy.

Tai manuaalisesti:
```bash
npm install -g vercel
vercel --prod
```

---

## 💻 Paikallinen kehitys

```bash
# 1. Kopioi .env.example → .env ja täytä omat osoitteet
cp .env.example .env

# 2. Asenna riippuvuudet
npm install

# 3. Käynnistä dev-serveri
npm run dev
```

---

## 🔑 Private Hugging Face Spaces

Jos Spacesi ovat private, lisää read token Vercel-muuttujiin:

```
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxx
```

Ja varmista että backendeissäsi (FastAPI tms.) on middleware joka tarkistaa tämän tokenin
Authorization-headerista: `Authorization: Bearer <token>`.

> Älä koskaan lisää HF-tokenia suoraan frontend-koodiin — se näkyy käyttäjille!

---

## Build Vercelille

```bash
npm run build
```

Output menee `dist/`-kansioon.

## Ympäristömuuttujat

| Muuttuja | Selite | Oletus |
|---|---|---|
| `VITE_INVENTORY_API` | Inventory backend URL | `http://localhost:8000` |
| `VITE_PUMP_API` | Pump detector backend URL | `http://localhost:8001` |
| `VITE_PORTFOLIO_API` | Portfolio backend URL | `http://localhost:8002` |
