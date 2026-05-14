# 生产维护手册

这份文档用于后续长期维护和交接，目标是把最常见的部署、备份、恢复和排障动作集中到一处。

## 技术架构

这个项目是一个本地优先的单体应用，核心结构比较简单，方便维护：

- 后端：Flask 提供 API 和页面入口，所有业务逻辑都集中在 [app.py](app.py) 里。
- 前端：静态页面放在 [frontend/](frontend/) 下，由 Flask 直接托管。
- 数据层：SQLite 作为本地数据库，默认文件是 `data.db`。
- 文件层：签证附件和申请材料存放在 `uploads/` 目录下。
- 配置层：`config.yaml` 管理登录账号、服务监听地址和存储路径。
- 访问控制：基于 Flask session 做登录状态管理，配合 `TRAVEL_MANAGER_SECRET_KEY` 固定会话密钥。

请求链路很直接：浏览器访问前端页面，前端通过接口调用 Flask，Flask 再读写 SQLite 和上传目录。

```text
Browser -> Flask API / Static Files -> SQLite + uploads/
```

这种结构的优点是部署简单、排障路径短，维护时优先检查配置、数据库文件和上传目录即可。

## 运行前检查

- 确认 `config.yaml` 已按实际环境修改。
- 确认数据库文件路径可写，默认是 `data.db`。
- 确认上传目录存在且可写，默认是 `uploads/applications` 和 `uploads/visas`。
- 生产环境必须设置稳定的会话密钥，否则服务重启后登录态会失效。

建议在启动前设置环境变量：

```powershell
$env:TRAVEL_MANAGER_SECRET_KEY = "replace-with-a-long-random-string"
```

也可以把它放到外部配置系统里，关键是每次重启都保持同一个值。

## 启动方式

当前仓库的标准启动方式仍然是：

```bash
uv run .\app.py
```

启动后默认访问：

```text
http://localhost:5000
```

如果你把 `config.yaml` 里的 `server.host` 改成 `0.0.0.0`，就可以从局域网访问。

## 配置项说明

### `auth`

- `username`：登录用户名。
- `password`：密码的 SHA256 哈希值，不要直接写明文密码。

### `server`

- `host`：监听地址。
- `port`：监听端口。

### `storage`

- `database_path`：SQLite 数据库文件。
- `visa_application_folder`：签证申请附件目录。
- `visa_folder`：签证文件目录。

## 日常维护

### 备份

至少备份以下内容：

- `data.db`
- `uploads/`
- `config.yaml`

如果要做完整恢复，以上三项缺一不可。

### 恢复

1. 停止应用。
2. 覆盖回数据库和上传目录。
3. 检查 `config.yaml` 是否与恢复的数据一致。
4. 用同一个 `TRAVEL_MANAGER_SECRET_KEY` 重启应用。

### 升级

1. 先备份数据库和上传目录。
2. 更新代码。
3. 重启服务。
4. 打开首页和 `/api/me` 做一次快速验证。

## 常见问题

### 登录后重启就掉线

通常是 `TRAVEL_MANAGER_SECRET_KEY` 改了，或者没有设置稳定的值。把它固定下来，再重启。

### 上传文件找不到

检查 `config.yaml` 里的文件目录配置，以及磁盘路径是否真的存在。

### 数据没更新

先确认是否连到了正确的 `data.db`。很多“看起来没生效”的问题，本质上是启动了另一份数据库文件。

### 页面能打开，但接口 401

说明没有登录，或者浏览器里的 session 已失效。先重新登录，再确认 cookie 没被清掉。

## 维护建议

- 不要把明文密码写进仓库。
- 不要频繁更换会话密钥。
- 定期检查数据库文件大小和上传目录占用。
- 有改动前先备份 `data.db`。

## 给接手的人

如果你只记住一件事：

- 数据在 `data.db`
- 附件在 `uploads/`
- 登录态依赖稳定的 `TRAVEL_MANAGER_SECRET_KEY`

这三项稳定，项目就很好维护。
