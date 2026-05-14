# 🌏 个人国际旅行管理系统

单人使用的个人旅行管理工具，轻量 SaaS 风格界面，本地 SQLite 数据存储。

## 快速启动

### 方式一：脚本启动（推荐）
```bash
chmod +x start.sh
./start.sh
```

### 方式二：手动启动
```bash
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 app.py
```

访问 http://localhost:5000

## 默认凭证

| 字段 | 值 |
|------|-----|
| 用户名 | `admin` |
| 密码 | `password` |

## 修改密码

在 `config.yaml` 中，`password` 字段存储的是密码的 SHA-256 哈希值。

生成新密码哈希：
```bash
python3 -c "import hashlib; print(hashlib.sha256('你的新密码'.encode()).hexdigest())"
```

## 配置文件 (config.yaml)

```yaml
auth:
  username: "admin"
  password: "sha256哈希值"

server:
  port: 5000
  host: "0.0.0.0"

storage:
  database_path: "data.db"
  visa_application_folder: "uploads/applications"
  visa_folder: "uploads/visas"
```

## 功能模块

| 模块 | 功能 |
|------|------|
| 🏠 仪表盘 | 旅行状态、签证到期提醒、统计概览 |
| 🗂️ 签证管理 | 添加/管理签证，状态追踪，图片预览 |
| 📋 签证申请 | 申请进度追踪，文件上传，自动创建签证 |
| ✈️ 行程记录 | 入境/离境记录，自动更新签证状态 |
| 📅 行程历史 | 按月分组的历史行程查询 |

## 目录结构

```
travel-manager/
├── app.py              # Flask 后端
├── config.yaml         # 配置文件
├── data.db             # SQLite 数据库（自动生成）
├── requirements.txt    # Python 依赖
├── start.sh            # 启动脚本
├── uploads/
│   ├── visas/          # 签证图片
│   └── applications/   # 申请文件
└── frontend/
    ├── index.html      # SPA 入口
    └── static/
        ├── css/style.css
        └── js/app.js
```

## 技术栈

- **后端**: Python + Flask
- **前端**: 原生 HTML/CSS/JS（无框架依赖）
- **数据库**: SQLite
- **认证**: Session-based
- **样式**: Light SaaS，支持深色模式自动切换
