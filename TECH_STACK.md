# AquaPanel 技术栈说明

## 🛠️ 核心技术栈

### 后端技术
- **Node.js** (v16+) - JavaScript运行时环境
- **Express.js** (v4.18) - Web应用框架
- **WebSocket** (ws v8.14) - 实时双向通信
- **systeminformation** (v5.21) - 系统信息获取库
- **bcryptjs** (v2.4) - 密码加密库
- **jsonwebtoken** (v9.0) - JWT认证令牌
- **node-cron** (v3.0) - 定时任务调度

### 前端技术
- **原生 HTML5** - 结构化标记语言
- **CSS3** - 样式表语言（液体玻璃效果）
- **原生 JavaScript (ES6+)** - 前端逻辑处理
- **WebSocket API** - 实时数据通信

### 设计风格
- **液体玻璃设计** - 现代化UI设计风格
- **蓝绿色主题** - 清新的配色方案
- **响应式布局** - 适配多种设备屏幕

## 🏗️ 系统架构

### 整体架构
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   浏览器客户端   │    │   Express服务器  │    │   系统监控模块   │
│                │    │                │    │                │
│  - HTML/CSS/JS │◄──►│  - REST API    │◄──►│  - CPU监控     │
│  - WebSocket   │    │  - WebSocket   │    │  - 内存监控     │
│  - 液体玻璃UI   │    │  - JWT认证     │    │  - 磁盘监控     │
└─────────────────┘    └─────────────────┘    │  - 网络监控     │
                                              └─────────────────┘
```

### 数据流
1. **用户认证流程**
   ```
   用户登录 → JWT验证 → 令牌生成 → 存储到localStorage
   ```

2. **实时监控流程**
   ```
   系统信息采集 → WebSocket推送 → 前端实时更新 → 图表渲染
   ```

3. **API请求流程**
   ```
   前端请求 → JWT验证 → 业务处理 → 数据返回 → 界面更新
   ```

## 📦 依赖说明

### 生产依赖 (dependencies)
```json
{
  "express": "^4.18.2",           // Web框架
  "ws": "^8.14.2",                // WebSocket库
  "systeminformation": "^5.21.20", // 系统信息获取
  "node-cron": "^3.0.3",          // 定时任务
  "bcryptjs": "^2.4.3",           // 密码加密
  "jsonwebtoken": "^9.0.2",       // JWT认证
  "multer": "^1.4.5-lts.1",       // 文件上传
  "body-parser": "^1.20.2",       // 请求体解析
  "cors": "^2.8.5"                // 跨域处理
}
```

### 开发依赖 (devDependencies)
```json
{
  "nodemon": "^3.0.1"             // 开发热重载
}
```

## 🎨 UI设计原理

### 液体玻璃效果 (Glassmorphism)
- **背景模糊** - `backdrop-filter: blur(10px)`
- **半透明背景** - `background: rgba(255, 255, 255, 0.1)`
- **柔和边框** - `border: 1px solid rgba(255, 255, 255, 0.2)`
- **阴影效果** - `box-shadow: 0 8px 32px rgba(0, 0, 0, 0.37)`

### 颜色主题
```css
:root {
  --primary-color: #00d4aa;      // 主色调 - 青绿色
  --secondary-color: #01b4d4;    // 辅色调 - 蓝色
  --accent-color: #00f5d4;       // 强调色 - 浅青色
  --dark-bg: #0a0e13;            // 深色背景
  --glass-bg: rgba(255, 255, 255, 0.1); // 玻璃背景
}
```

### 动画效果
- **浮动气泡** - CSS动画创建背景装饰
- **淡入淡出** - 页面切换平滑过渡
- **波纹效果** - 按钮点击反馈
- **圆形进度条** - CPU/内存使用率动画

## 📊 性能监控

### 监控指标
- **CPU使用率** - 实时/用户/系统占用
- **内存使用** - 总量/已用/可用/使用率
- **磁盘状态** - 各分区使用情况
- **网络流量** - 上行/下行速度
- **系统信息** - OS/硬件/运行时间

### 数据采集频率
- **实时数据** - 每2秒更新
- **系统信息** - 每10分钟更新
- **历史数据** - 保留60个数据点

## 🔐 安全机制

### 认证授权
- **JWT令牌** - 无状态身份认证
- **密码加密** - bcrypt加盐哈希
- **会话管理** - 24小时有效期
- **登录限制** - 失败5次锁定15分钟

### 数据安全
- **HTTPS支持** - 支持SSL/TLS加密
- **CORS配置** - 跨域请求控制
- **输入验证** - 防止注入攻击
- **权限控制** - 基于角色的访问

## 🚀 部署方案

### 推荐部署方式
1. **Systemd服务** - 系统级服务管理
2. **Nginx反向代理** - 提供HTTPS和负载均衡
3. **PM2进程管理** - 进程守护和集群
4. **Docker容器** - 容器化部署（可选）

### 系统要求
- **操作系统** - Linux (Ubuntu/Debian/CentOS/RHEL)
- **Node.js** - v16.0+
- **内存** - 最低512MB，推荐1GB+
- **磁盘** - 最低1GB可用空间
- **网络** - 稳定的网络连接

## 📈 扩展性设计

### 模块化设计
- **认证模块** - 独立的用户认证系统
- **监控模块** - 可插拔的监控组件
- **API模块** - RESTful API设计
- **前端模块** - 组件化UI设计

### 未来扩展计划
- **进程管理** - 系统进程监控和管理
- **日志分析** - 系统日志查看和分析
- **告警系统** - 阈值告警和通知
- **用户管理** - 多用户权限管理
- **插件系统** - 第三方插件支持

## 🔧 开发工具

### 推荐开发环境
- **编辑器** - VSCode / WebStorm
- **Node版本管理** - nvm
- **包管理器** - npm / yarn
- **调试工具** - Chrome DevTools
- **API测试** - Postman / Insomnia

### 代码规范
- **ESLint** - JavaScript代码检查
- **Prettier** - 代码格式化
- **Git Hooks** - 提交前检查
- **JSDoc** - 函数注释规范

## 📚 学习资源

### 相关技术文档
- [Node.js官方文档](https://nodejs.org/docs/)
- [Express.js文档](https://expressjs.com/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [CSS Glassmorphism](https://glassmorphism.com/)
- [JWT.io](https://jwt.io/)

### 设计参考
- [Glassmorphism设计指南](https://uxdesign.cc/glassmorphism-in-user-interfaces-1f39bb1308c9)
- [现代Web设计趋势](https://www.awwwards.com/)
- [CSS Grid布局](https://css-tricks.com/snippets/css/complete-guide-grid/)

---

**版本**: 1.0.0  
**最后更新**: 2024年1月1日  
**维护者**: AquaPanel Team