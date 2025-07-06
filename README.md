# AquaPanel - 现代化服务器管理面板

<div align="center">
  <img src="https://img.shields.io/badge/version-1.7.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/node->=16.0.0-brightgreen.svg" alt="Node Version">
  <img src="https://img.shields.io/badge/platform-linux-lightgrey.svg" alt="Platform">
</div>

## � 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | sudo bash
```

安装完成后访问：`http://your-server-ip:3000`  
默认用户名：`admin` 密码：`admin123`

## �📖 项目简介

AquaPanel 是一个现代化的服务器管理面板，采用液体玻璃设计风格，提供直观美观的用户界面。该项目使用 Node.js 作为后端，原生 HTML/CSS/JavaScript 作为前端，实现了实时的服务器监控和管理功能。

### ✨ 特性

- 🎨 **液体玻璃设计** - 采用现代化的液体玻璃效果和蓝绿色主题
- 📊 **实时监控** - 实时显示 CPU、内存、磁盘、网络等系统信息
- 🔄 **WebSocket 连接** - 实时数据更新，无需刷新页面
- 📱 **响应式设计** - 完美适配桌面和移动设备
- 🔐 **安全认证** - JWT 令牌认证，保护系统安全
- 🚀 **一键安装** - 提供自动化安装脚本
- 📈 **历史数据** - 记录和展示系统性能历史趋势
- 🛠️ **易于管理** - 提供命令行管理工具

### 🎯 主要功能

- **系统仪表板** - 显示系统概览、CPU、内存、网络、磁盘使用情况
- **实时监控** - 实时更新系统性能数据
- **系统信息** - 详细的硬件和软件信息
- **进程管理** - 查看和管理系统进程，支持实时更新和进程终止
- **日志查看** - 查看系统日志和应用日志，支持搜索和筛选
- **文件管理** - 浏览服务器文件系统，支持文件查看和预览
- **服务管理** - 管理系统服务，支持启动、停止、重启操作
- **Web终端** - 在线执行系统命令，支持命令历史和快捷命令
- **网络监控** - 实时网络连接监控、端口扫描、流量统计
- **软件包管理** - 软件包安装、卸载、搜索和状态管理
- **定时任务管理** - crontab任务的可视化创建、编辑和管理
- **监控告警** - 系统性能阈值告警、通知推送和历史记录
- **备份管理** - 系统配置、数据和完整备份的创建、下载和管理
- **Docker容器管理** - 容器和镜像的实时监控、生命周期管理
- **性能分析** - 深度系统性能分析、进程资源监控、I/O统计
- **安全扫描** - 全面的系统安全检查、漏洞扫描和安全报告
- **用户管理** - 安全的用户认证和授权

## 🚀 快速开始

### 系统要求

- Linux 操作系统（Ubuntu/Debian/CentOS/RHEL）
- Node.js 16.0 或更高版本
- 至少 512MB 可用内存
- 至少 1GB 可用磁盘空间

### 在线安装（推荐）

```bash
# 一键安装
curl -fsSL https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | sudo bash

# 或使用 wget
wget -qO- https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | sudo bash
```

### 本地安装

```bash
# 克隆项目
git clone https://github.com/xieming1904/xiexieminaban.git
cd xiexieminaban

# 赋予安装脚本执行权限
chmod +x install.sh

# 运行安装脚本（需要 root 权限）
sudo ./install.sh
```

### 手动安装

1. **安装依赖**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm

# CentOS/RHEL
sudo yum install nodejs npm
```

2. **克隆项目**
```bash
git clone https://github.com/xieming1904/xiexieminaban.git
cd xiexieminaban
```

3. **安装 Node.js 依赖**
```bash
npm install
```

4. **启动应用**
```bash
npm start
```

## 🔧 配置说明

### 环境变量

在 `.env` 文件中设置以下环境变量：

```env
# 服务器端口
PORT=3000

# JWT 密钥
JWT_SECRET=your-secret-key-here

# 数据目录
DATA_DIR=/opt/aquapanel/data

# 日志目录
LOGS_DIR=/opt/aquapanel/logs
```

### 配置文件

应用配置文件位于 `config.json`：

```json
{
  "port": 3000,
  "jwt_secret": "your-secret-key",
  "data_dir": "./data",
  "logs_dir": "./logs",
  "update_interval": 2000,
  "max_history_points": 60,
  "security": {
    "session_timeout": 86400,
    "max_login_attempts": 5,
    "lockout_time": 900
  }
}
```

## 🎮 使用方法

### 访问面板

安装完成后，访问以下地址：
- 默认地址: `http://your-server-ip:3000`
- 默认用户名: `admin`
- 默认密码: `admin123`

### 管理命令

安装完成后，可以使用以下命令管理 AquaPanel：

```bash
# 启动服务
aquapanel start

# 停止服务
aquapanel stop

# 重启服务
aquapanel restart

# 查看状态
aquapanel status

# 查看日志
aquapanel logs

# 创建备份
aquapanel backup

# 更新系统
aquapanel update

# 卸载系统
aquapanel uninstall
```

### 功能说明

#### 系统仪表板
- 实时显示系统状态
- CPU 使用率圆形进度条
- 内存使用率圆形进度条
- 网络实时流量统计
- 磁盘使用情况列表

#### 系统信息
- CPU 详细信息
- 内存配置信息
- 网络接口信息
- 操作系统信息

#### 进程管理
- 实时查看所有系统进程
- 按CPU和内存使用率筛选进程
- 显示进程详细信息（PID、用户、状态、启动时间等）
- 支持终止进程操作
- 实时更新进程状态

#### 日志查看
- 查看应用日志和系统日志
- 支持日志搜索和过滤
- 实时日志更新
- 不同日志级别的颜色标识
- 自动滚动到最新日志

#### 文件管理
- 浏览服务器文件系统
- 支持多种文件类型预览
- 目录导航和路径跳转
- 显示文件权限和修改时间
- 文件大小智能格式化

#### 服务管理
- 查看系统服务状态
- 支持启动、停止、重启服务
- 服务状态实时更新
- 服务操作确认对话框
- 服务描述信息显示

#### Web终端
- 在线执行系统命令
- 命令历史记录和导航
- 快捷命令按钮
- 危险命令安全拦截
- 命令执行超时保护

#### 安全特性
- JWT 令牌认证
- 密码加密存储
- 会话超时保护
- 登录失败锁定
- 危险命令黑名单

## 🛠️ 开发指南

### 项目结构

```
aquapanel/
├── app.js                 # 主应用文件
├── package.json          # 依赖配置
├── install.sh            # 安装脚本
├── config.json           # 配置文件
├── public/               # 静态文件
│   ├── index.html        # 主页面
│   ├── css/              # 样式文件
│   │   ├── style.css     # 主样式
│   │   └── animations.css # 动画效果
│   └── js/               # JavaScript 文件
│       ├── main.js       # 主应用逻辑
│       ├── auth.js       # 认证处理
│       ├── dashboard.js  # 仪表板逻辑
│       ├── processes.js  # 进程管理
│       ├── logs.js       # 日志查看
│       ├── files.js      # 文件管理
│       ├── services.js   # 服务管理
│       ├── terminal.js   # Web终端
│       ├── network.js    # 网络监控
│       ├── packages.js   # 软件包管理
│       ├── crontab.js    # 定时任务管理
│       ├── alerts.js     # 监控告警
│       ├── backup.js     # 备份管理
│       ├── docker.js     # Docker容器管理
│       ├── performance.js # 性能分析
│       └── security.js   # 安全扫描
├── data/                 # 数据目录
├── logs/                 # 日志目录
└── backups/              # 备份目录
```

### 开发模式

```bash
# 安装开发依赖
npm install

# 启动开发服务器
npm run dev

# 或者使用 nodemon
npx nodemon app.js
```

### API 接口

#### 认证
- `POST /api/login` - 用户登录
- `GET /api/system-info` - 获取系统信息
- `GET /api/performance` - 获取性能数据

#### 进程管理
- `GET /api/processes` - 获取进程列表
- `POST /api/processes/:pid/kill` - 终止进程

#### 日志管理
- `GET /api/logs/app` - 获取应用日志
- `GET /api/logs/system` - 获取系统日志

#### 文件管理
- `GET /api/files` - 获取文件列表
- `GET /api/files/content` - 获取文件内容

#### 服务管理
- `GET /api/services` - 获取服务列表
- `POST /api/services/:name/:action` - 控制服务（start/stop/restart）

#### 终端
- `POST /api/terminal` - 执行系统命令

#### 网络监控
- `GET /api/network/connections` - 获取网络连接
- `POST /api/network/scan` - 端口扫描
- `GET /api/network/stats` - 获取网络统计

#### 软件包管理
- `GET /api/packages` - 获取软件包列表
- `POST /api/packages/install` - 安装软件包
- `POST /api/packages/remove` - 卸载软件包

#### 定时任务管理
- `GET /api/crontab` - 获取定时任务列表
- `POST /api/crontab` - 添加定时任务
- `DELETE /api/crontab/:id` - 删除定时任务

#### 监控告警
- `GET /api/alerts/config` - 获取告警配置
- `PUT /api/alerts/config` - 更新告警配置
- `GET /api/alerts/history` - 获取告警历史

#### 系统备份管理
- `GET /api/backup/list` - 获取备份文件列表
- `POST /api/backup/create` - 创建新备份
- `GET /api/backup/download/:filename` - 下载备份文件
- `DELETE /api/backup/:filename` - 删除备份文件

#### Docker容器管理
- `GET /api/docker/containers` - 获取容器列表
- `GET /api/docker/images` - 获取镜像列表
- `POST /api/docker/container/:id/:action` - 容器操作

#### 性能分析
- `GET /api/performance/history` - 获取性能历史数据
- `GET /api/performance/top-processes` - 获取资源使用Top10进程
- `GET /api/performance/io-stats` - 获取I/O和虚拟内存统计

#### 安全扫描
- `GET /api/security/scan` - 执行系统安全扫描

#### WebSocket
- 实时性能数据推送
- 实时进程数据推送
- 连接地址: `ws://your-server:3000`

### 自定义开发

1. **添加新页面**
   - 在 `public/index.html` 中添加页面结构
   - 在 `public/js/main.js` 中添加页面逻辑
   - 在 `public/css/style.css` 中添加样式

2. **添加新 API**
   - 在 `app.js` 中添加路由
   - 添加相应的处理函数

3. **修改样式**
   - 编辑 `public/css/style.css`
   - 动画效果在 `public/css/animations.css`

## 🔒 安全说明

### 默认安全设置

- 默认用户名/密码仅用于初始化
- 建议首次登录后立即修改密码
- JWT 令牌有效期为 24 小时
- 密码使用 bcrypt 加密存储

### 安全建议

1. **修改默认密码**
   - 首次登录后立即修改默认密码
   - 使用强密码（至少 8 位，包含大小写字母、数字、特殊字符）

2. **防火墙配置**
   - 仅开放必要的端口（默认 3000）
   - 使用 fail2ban 防护暴力破解

3. **HTTPS 配置**
   - 生产环境建议使用 HTTPS
   - 可以使用 Nginx 反向代理配置 SSL

4. **定期更新**
   - 定期更新系统和依赖包
   - 关注安全公告和漏洞修复

## 📝 更新日志

### v1.7.0 (2024-12-20)
- 💾 新增系统备份管理 - 支持系统配置、数据和完整备份
- 🐳 新增Docker容器管理 - 容器状态监控和生命周期管理
- 📈 新增性能分析功能 - 深度系统性能分析和进程监控
- 🔐 新增安全扫描系统 - 全面的系统安全检查和报告
- 📊 增强系统监控图表 - SVG图表和数据可视化
- 🎨 优化用户界面设计 - 新增标签页、进度条等组件
- 🔧 完善模块化架构 - 改进代码结构和维护性
- 🛡️ 加强安全机制 - 增强权限控制和操作审计

### v1.6.0 (2024-01-20)
- 🌐 新增网络监控功能 - 实时连接监控、端口扫描、流量统计
- 📦 新增软件包管理 - 软件包安装、卸载、搜索功能
- ⏰ 新增定时任务管理 - crontab任务可视化管理
- 🚨 新增监控告警系统 - 阈值设置、实时告警、历史记录
- 🔔 新增通知系统 - 浏览器通知、页面通知
- 📊 优化系统性能监控
- 🎨 增强UI组件和交互体验
- 🔒 进一步完善安全机制

### v1.5.0 (2024-01-15)
- 🎉 新增进程管理功能
- 📋 新增日志查看功能
- 📁 新增文件管理功能
- 🛠️ 新增服务管理功能
- 💻 新增Web终端功能
- 🔒 增强安全防护机制
- 📊 优化实时数据传输
- 🎨 完善UI细节和交互

### v1.0.0 (2024-01-01)
- 🎉 初始版本发布
- ✨ 液体玻璃设计界面
- 📊 实时系统监控
- 🔐 JWT 认证系统
- 🚀 一键安装脚本
- 📱 响应式设计

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 代码规范

- 使用 ESLint 进行代码检查
- 遵循 JavaScript Standard Style
- 添加适当的注释
- 编写测试用例

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [systeminformation](https://github.com/sebhildebrandt/systeminformation) - 系统信息获取
- [Express.js](https://expressjs.com/) - Web 应用框架
- [WebSocket](https://github.com/websockets/ws) - 实时通信
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js) - 密码加密
- [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) - JWT 认证

## 📞 支持

如果您遇到问题或有建议，请：

1. 查看 [Issues](https://github.com/xieming1904/xiexieminaban/issues)
2. 创建新的 Issue
3. 访问项目主页：[https://github.com/xieming1904/xiexieminaban](https://github.com/xieming1904/xiexieminaban)

---

<div align="center">
  Made with ❤️ by AquaPanel Team
</div>
