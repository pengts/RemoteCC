# RemoteCC

RemoteCC (原 OpenCovibe) 是一个本地优先 (local-first) 的 Web 应用，为 AI 编程 CLI 工具 (Claude Code、Codex 等) 提供可视化交互界面。

项目采用纯 Web 架构：Rust axum 后端 + Svelte 5 前端，通过 HTTP/WebSocket 通信。专为**远程服务器部署**设计，支持通过 SSH 端口转发在本地浏览器中访问远端的 AI 编程助手。

---

## 功能概览

### 核心对话

- 与 Claude Code / Codex CLI 进行实时流式对话
- 支持工具调用可视化（文件读写、命令执行、代码 diff 等）
- 消息中支持 Markdown 渲染、代码语法高亮、ANSI 颜色
- 权限控制模式：询问确认 / 自动读取 / 完全自动 / 委托模式
- 对话导出为 Markdown 文件

### 输入增强

- 斜杠命令自动补全 (`/compact`, `/plan`, `/review` 等)
- 文件附件（文本、代码、图片、PDF、Excel 表格，最多 10 个文件 / 100MB）
- 命令面板 (Cmd+K / Ctrl+K)：24+ 快捷操作

### 会话管理

- 按项目目录 (cwd) 自动分组的文件夹视图
- 会话重命名、删除、收藏
- 自动同步 Claude CLI 本地会话（每 10 秒）
- CLI 端的 rename 操作自动同步到 Web 端
- 对话分支 (Fork) 和状态回退 (Rewind)
- 侧栏宽度可拖拽调整

### 多 Agent 支持

| Agent | CLI | 特性 |
|-------|-----|------|
| Claude | `claude` | stream-json 协议、OAuth/API Key 认证、Plan 模式、上下文压缩 |
| Codex | `codex` | JSON 输出格式、exec 模式 |

### 设置与配置

- **通用设置**：语言切换（中/英）、认证模式、平台凭据管理
- **CLI 配置**：工具白名单、系统提示词、预算限制、模型选择、权限模式
- **快捷键**：完整自定义，冲突检测
- **远程主机**：SSH 连接配置（主机、端口、密钥路径、远程工作目录）
- **调试面板**：日志查看、筛选、导出

### 其他功能

- **文件浏览器**：项目目录浏览、Git diff 查看、Markdown 预览
- **Memory 管理**：持久化上下文 Markdown 文件的编辑器
- **Token 用量统计**：热力图日历、每日聚合、费用明细
- **团队面板**：任务看板、收件箱、成员状态
- **插件市场**：插件/技能安装、MCP Server 管理、自定义 Agent 定义
- **国际化**：支持中文 (zh-CN) 和英文 (en)
- **主题**：亮色/暗色自动切换

---

## 技术架构

```
+------------------------------+        +-------------------------------+
|          Frontend            |        |           Backend             |
|  Svelte 5 + SvelteKit       | HTTP   |  Rust + Tokio + axum          |
|  Tailwind CSS                |------->|  POST /api/{endpoint}         |
|  adapter-static -> build/    |        |  GET  /ws (WebSocket)         |
|  Port :1420 (dev)            | WS     |  Port :8080                   |
+------------------------------+        +-------------------------------+
                                                    |
                                                    v
                                        +-------------------------------+
                                        |      AI CLI Process           |
                                        |  claude / codex               |
                                        |  stream-json / PTY / pipe     |
                                        +-------------------------------+
```

### 后端 (`src-tauri/src/`)

- `lib.rs` - axum 服务器启动、静态文件服务、CORS
- `routes.rs` - 全部 API 路由注册
- `app_state.rs` - 统一应用状态
- `ws.rs` - WebSocket 广播 (tokio broadcast channel)
- `agent/` - 会话生命周期管理、CLI 进程管理、协议适配
- `commands/` - 各功能模块的 API 处理函数
- `storage/` - 本地数据持久化 (`~/.opencovibe/`)
- `hooks/` - 后台任务（CLI 自动同步、团队文件监听）

### 前端 (`src/`)

- `lib/api.ts` - ~100 个 API 调用函数
- `lib/transport.ts` - HTTP 传输层 (fetch 封装)
- `lib/stores/` - Svelte 5 runes 状态管理 + WebSocket 事件中间件
- `lib/components/` - 50+ Svelte 5 组件
- `routes/` - 页面路由（chat、settings、explorer、usage、teams、plugins 等）

### 数据存储

所有数据存储在 `~/.opencovibe/`：

```
~/.opencovibe/
  settings.json                  # 用户设置
  keybindings.json               # 自定义快捷键
  runs/{run-id}/
    meta.json                    # 会话元数据（prompt、cwd、model、status）
    events.jsonl                 # 事件日志（消息、工具调用等）
    artifacts.json               # 摘要产物
```

---

## 环境要求

- **Node.js** >= 20
- **Rust** (stable toolchain, edition 2021)
- **Claude Code CLI** 或 **Codex CLI**（至少安装一个）

---

## 安装与构建

### 1. 安装依赖

```bash
# 前端依赖
npm install

# Rust 依赖由 cargo 自动管理
```

### 2. 构建

```bash
# 构建前端静态文件
npm run build

# 构建后端二进制（release 模式）
cd src-tauri && cargo build --release
# 输出: src-tauri/target/release/opencovibe-server
```

### 3. 启动服务

```bash
./src-tauri/target/release/opencovibe-server
```

服务默认监听 `http://127.0.0.1:8080`。

---

## 使用方法

### 场景一：本地使用

1. 构建并启动服务（见上方）
2. 浏览器打开 `http://127.0.0.1:8080`
3. 按照 Setup Wizard 完成初始化配置

### 场景二：远程服务器 + SSH 端口转发（推荐）

这是本项目的核心使用场景 -- 在远程开发服务器上运行 AI 编程助手，通过本地浏览器操作。

**在远程服务器上：**

```bash
# 1. 确保远程服务器已安装 Claude Code CLI
claude --version

# 2. 构建并启动 RemoteCC 服务
./src-tauri/target/release/opencovibe-server
# 服务在 127.0.0.1:8080 启动
```

**在本地机器上：**

```bash
# 3. SSH 端口转发
ssh -L 8080:127.0.0.1:8080 user@remote-server

# 4. 打开浏览器访问
open http://127.0.0.1:8080
```

也可以在 `~/.ssh/config` 中配置持久转发：

```
Host your-server
    LocalForward 8080 127.0.0.1:8080
```

### 首次使用：Setup Wizard

首次启动时，应用会自动检测环境并引导完成配置：

1. **CLI 检测** - 自动检查 Claude Code / Codex CLI 是否已安装。未安装时提供各平台安装命令（homebrew、curl、scoop 等）
2. **认证方式选择**：
   - **OAuth 登录**：自动打开浏览器完成 Anthropic 账号授权
   - **API Key**：支持 15+ 平台预设（Anthropic、Claude.ai、OpenAI、Ollama、自定义端点等），填入密钥即可
3. **完成** - 进入主界面

### 日常操作流程

#### 发起对话

1. 点击侧栏顶部的 **"+ New Chat"** 按钮（或使用快捷键）
2. 在输入框中输入 prompt，按 Enter 发送
3. 观察 AI 的流式回复，包括工具调用的实时进度
4. 如遇权限确认弹窗，选择允许/拒绝工具执行

#### 管理会话

- **切换会话** - 点击左侧栏中的会话项
- **重命名** - 右键会话名称
- **删除** - hover 会话项时点击垃圾桶图标（会同时删除对应的 CLI 本地文件，防止重复导入）
- **项目分组** - 会话按工作目录自动归入项目文件夹，文件夹可折叠/展开
- **调整侧栏宽度** - 拖拽侧栏右侧边缘

#### 命令面板 (Cmd+K / Ctrl+K)

| 命令 | 说明 |
|------|------|
| Compact Conversation | 压缩上下文，释放 token 空间 |
| Toggle Plan Mode | 切换为只读规划模式（仅 Claude） |
| Review Changes | 查看 Git 变更的 diff |
| Export Conversation | 导出当前对话为 Markdown |
| Git Diff / Git Status | 查看仓库状态 |
| Doctor Check | 诊断 CLI 连接和配置问题 |
| Change Model | 切换 AI 模型 |
| Change Working Directory | 切换工作目录 |

#### CLI 会话自动同步

- 后台每 10 秒自动扫描 `~/.claude/projects/` 目录
- 新的 CLI 会话自动导入到 Web 端侧栏
- CLI 端通过 `/rename` 命令修改的会话名称自动同步到 Web 端
- Web 端手动重命名的会话名称优先级高于 CLI 同步名称
- 删除会话时同步删除 CLI 本地文件，不会重复导入

#### 文件附件

在输入框中支持拖拽或粘贴文件：
- 文本 / 代码文件
- 图片（支持预览）
- PDF（最多 20 页）
- Excel 表格（自动转换为文本）
- 限制：最多 10 个文件，总计 100MB

### CLI 与 Web 端交替使用

RemoteCC 会自动同步 Claude CLI 的本地会话数据（每秒扫描 `~/.claude/projects/`），因此你可以在 CLI 和 Web 端之间灵活切换。但需要注意以下几点：

**核心原则：同一个会话在同一时刻只能有一个活跃的 CLI 进程。**

- **在 CLI 端操作时**：Web 端会自动同步并展示新消息（非流式，有约 1 秒延迟）。无需在 Web 端做任何操作。
- **在 Web 端操作时**：Web 会 spawn 一个 `claude --resume <session_id>` 进程。此时**不要**在 CLI 端同时操作同一个会话，否则两个进程会同时写入同一个 JSONL 文件导致数据损坏。
- **从 CLI 切换到 Web**：确保 CLI 端的会话已经回到 idle 状态（模型回复完毕、不在等待输入），然后再在 Web 端发送消息。Web 端会自动 resume 并发送。
- **从 Web 切换到 CLI**：在 Web 端点击顶部状态栏的 "End Session" 按钮停止会话（或等模型回复完毕自动 idle），然后再在 CLI 端操作。

**会话状态说明：**

| 状态 | 含义 |
|------|------|
| `running` | Web 端正在与 CLI 进程实时交互 |
| `stopped` | 会话已结束，可通过发送新消息自动恢复 |
| `completed` | 会话正常完成 |
| `failed` | 会话出错终止 |

> 侧栏中会话旁的环形箭头按钮是 **Resume（恢复会话）**，而非刷新按钮。点击后会建立与 CLI 的实时连接。在 CLI 端正在运行时请勿点击。

---

## 开发指南

```bash
# 前端开发（热重载，自动代理 /api 和 /ws 到后端 :8080）
npm run dev              # Vite dev server on :1420

# 后端开发
cd src-tauri && cargo run

# 运行测试
npm run test
npm run test:watch

# 代码检查
npm run lint             # ESLint
npm run format           # Prettier
npm run rust:check       # cargo fmt + clippy

# 完整验证
npm run verify           # lint + format + i18n + test + build + rust:check
```

开发模式下前后端分离运行：Vite dev server 在 `:1420` 上运行，自动将 `/api` 和 `/ws` 请求代理到后端 `:8080`。

---

## API 概览

所有接口使用 `POST /api/{group}/{action}` + JSON body：

```
POST /api/session/start          # 创建新会话
POST /api/session/message        # 发送消息
POST /api/session/stop           # 停止会话
POST /api/runs/list              # 获取会话列表
POST /api/runs/delete            # 删除会话
POST /api/settings/user/get      # 获取用户设置
POST /api/settings/user/update   # 更新用户设置
GET  /api/system/version         # 获取版本号
GET  /ws                         # WebSocket 实时事件
```

WebSocket 事件格式：`{"event":"<type>","payload":{...}}`

事件类型：`bus-event`, `pty-output`, `pty-exit`, `chat-delta`, `chat-done`, `cli-sync-update`, `team-update`, `task-update` 等。

---

## 致谢

本项目基于 [OpenCovibe](https://github.com/AnyiWang/OpenCovibe) (by AnyiWang) 进行 Web 架构迁移。原项目是一个优秀的 Tauri v2 桌面应用，我们将其从 Tauri IPC 迁移到 axum HTTP/WebSocket 架构，以支持远程服务器部署场景。感谢原作者构建的扎实基础。

## 许可证

[Apache License 2.0](LICENSE)
