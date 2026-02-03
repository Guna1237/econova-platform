# Econova Financial Simulation Platform

A comprehensive financial simulation platform for educational purposes, featuring real-time market dynamics, auction systems, and credit networks.

## Features

- 🏦 **Market Simulation**: Dynamic asset pricing with realistic market shocks
- 🔨 **Auction System**: Live bidding for assets with automatic resolution
- 💰 **Credit Network**: Peer-to-peer lending with interest and default mechanics
- 📊 **Portfolio Management**: Real-time tracking of holdings and P&L
- 👥 **Multi-Team Support**: Admin controls for managing multiple teams
- 📈 **Price Charts**: Historical price tracking and visualization

## Tech Stack

**Backend**:
- FastAPI (Python)
- SQLModel + SQLite
- JWT Authentication
- Uvicorn ASGI server

**Frontend**:
- React + Vite
- Framer Motion (animations)
- Lucide React (icons)
- Recharts (data visualization)
- Axios (API client)

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- Git

### Backend Setup

```bash
cd backend
python -m venv venv
./venv/Scripts/activate  # Windows
# source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

### Frontend Setup

```bash
cd frontend
npm install
```

### Running Locally

**Terminal 1 - Backend**:
```bash
cd backend
./venv/Scripts/activate
uvicorn backend.main:app --reload --host 0.0.0.0
```

**Terminal 2 - Frontend**:
```bash
cd frontend
npm run dev
```

Visit: `http://localhost:5173`

## Deployment

See [deployment_guide.md](deployment_guide.md) for detailed instructions on deploying to Render (backend) and Vercel (frontend).

**Quick Deploy**:
1. Push code to GitHub
2. Connect Render to your repo (auto-detects `render.yaml`)
3. Connect Vercel to your repo (auto-detects `vercel.json`)
4. Done! Auto-deploys on every push

## Default Credentials

**Admin**:
- Username: `admin`
- Password: `admin123`

## Project Structure

```
econova_g/
├── backend/
│   ├── main.py           # FastAPI app & routes
│   ├── engine.py         # Market simulation engine
│   ├── models.py         # Database models
│   ├── auth.py           # JWT authentication
│   └── requirements.txt  # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── pages/        # Dashboard, Login
│   │   ├── components/   # AuctionHouse, CreditNetwork, etc.
│   │   └── services/     # API client
│   ├── package.json
│   └── vite.config.js
├── render.yaml           # Render deployment config
├── vercel.json           # Vercel deployment config
└── .gitignore
```

## API Documentation

Once running, visit:
- Local: `http://localhost:8000/docs`
- Production: `https://your-backend.onrender.com/docs`

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
