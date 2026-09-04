#!/bin/bash
# ==============================================================================
# Config Intelligence AI - Unified Platform Launcher
# Launches:
#   1. FastAPI Backend (port 8000)
#   2. Next.js Observability UI (port 3000)
#   3. Streamlit Data Application (port 8501)
# ==============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "========================================================="
echo " 🚀 Starting Config Intelligence AI Platform"
echo " Directory: $PROJECT_DIR"
echo "========================================================="

# 1. Check Python Virtual Environment
if [ ! -d "$PROJECT_DIR/venv" ]; then
    echo "⚠️  Python virtualenv not found. Creating ./venv..."
    python3 -m venv "$PROJECT_DIR/venv"
    "$PROJECT_DIR/venv/bin/pip" install --upgrade pip
    "$PROJECT_DIR/venv/bin/pip" install -r requirements.txt
fi

PYTHON="$PROJECT_DIR/venv/bin/python"
UVICORN="$PROJECT_DIR/venv/bin/uvicorn"
STREAMLIT="$PROJECT_DIR/venv/bin/streamlit"

# 2. Check Frontend Dependencies
if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
    echo "⚠️  Frontend dependencies missing. Running npm install..."
    cd "$PROJECT_DIR/frontend" && npm install && cd "$PROJECT_DIR"
fi

# 3. Clean up any stale port bindings if requested or needed
cleanup_port() {
    local port=$1
    local pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "🔄 Port $port is in use by PID(s): $pids. Releasing..."
        kill -9 $pids 2>/dev/null || true
        sleep 1
    fi
}

echo "🔍 Ensuring ports 8000, 3000, and 8501 are available..."
cleanup_port 8000
cleanup_port 3000
cleanup_port 8501

# Trap SIGINT / SIGTERM to cleanly kill background processes on exit
cleanup_all() {
    echo ""
    echo "🛑 Shutting down Config Intelligence AI services..."
    kill $(jobs -p) 2>/dev/null || true
    cleanup_port 8000
    cleanup_port 3000
    cleanup_port 8501
    echo "✅ All services stopped."
    exit 0
}
trap cleanup_all SIGINT SIGTERM EXIT

# 4. Start FastAPI Backend
echo "⚡ Starting FastAPI Backend on http://0.0.0.0:8000..."
"$UVICORN" main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# 5. Start Streamlit Application
echo "📊 Starting Streamlit Dashboard on http://localhost:8501..."
"$STREAMLIT" run app.py --server.headless true --server.port 8501 &
STREAMLIT_PID=$!

# 6. Start Next.js Frontend
echo "💻 Starting Next.js Frontend on http://localhost:3000..."
cd "$PROJECT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
cd "$PROJECT_DIR"

# 7. Wait for Backend & Frontend to respond
echo "⏳ Waiting for services to become healthy..."
MAX_WAIT=20
COUNT=0

while [ $COUNT -lt $MAX_WAIT ]; do
    if curl -s http://localhost:8000/api/health >/dev/null 2>&1 && curl -s http://localhost:3000 >/dev/null 2>&1; then
        echo ""
        echo "========================================================="
        echo " 🎉 All Services are Live & Operational!"
        echo " 🌐 Next.js Frontend:    http://localhost:3000"
        echo " 📊 Streamlit Dashboard:  http://localhost:8501"
        echo " ⚡ FastAPI Backend:      http://localhost:8000"
        echo " 📚 API Documentation:    http://localhost:8000/docs"
        echo "========================================================="
        echo "Press CTRL+C at any time to stop all services."
        break
    fi
    sleep 1
    COUNT=$((COUNT+1))
    printf "."
done

# 8. Open default browser on macOS
if command -v open >/dev/null 2>&1; then
    sleep 1
    open "http://localhost:3000"
fi

# Keep script running
wait
