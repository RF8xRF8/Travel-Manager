#!/usr/bin/env bash
# Travel Manager Startup Script

set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  🌏 个人国际旅行管理系统"
echo "============================================"

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "❌ 未找到 Python3，请安装后重试"
  exit 1
fi

# Create venv if needed
if [ ! -d "venv" ]; then
  echo "📦 正在创建虚拟环境..."
  python3 -m venv venv
fi

# Activate
source venv/bin/activate 2>/dev/null || . venv/Scripts/activate 2>/dev/null

# Install deps
echo "📦 正在安装依赖..."
pip install -r requirements.txt -q

# Check config
if [ ! -f "config.yaml" ]; then
  echo "⚠️  未找到 config.yaml，请根据 README 创建配置文件"
  exit 1
fi

echo ""
echo "✅ 系统启动中..."
echo "🌐 访问地址: http://localhost:5000"
echo "👤 默认用户名: admin  密码: password"
echo "📁 数据库: data.db"
echo ""
echo "按 Ctrl+C 停止服务"
echo "============================================"

python3 app.py
