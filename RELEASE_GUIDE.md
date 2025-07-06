# AquaPanel v1.5.0 发布指南

## 🎯 发布说明

由于Pull Request已经合并，我们需要创建一个新的版本发布。本指南将帮助你重新发布AquaPanel v1.5.0版本。

## 📋 发布前检查清单

### ✅ 代码准备
- [x] 版本号已更新为 v1.5.0
- [x] 所有新功能代码已完成
- [x] README.md 已更新
- [x] 文档已同步更新

### ✅ 功能验证
- [x] 进程管理功能正常
- [x] 日志查看功能正常
- [x] 文件管理功能正常
- [x] 服务管理功能正常
- [x] Web终端功能正常

## 🚀 发布步骤

### 1. 更新版本信息

```bash
# 确保在项目根目录
cd /path/to/your/project

# 检查当前版本
grep version package.json
# 应该显示: "version": "1.5.0"
```

### 2. 提交最新更改

```bash
# 添加所有更改
git add .

# 提交更改
git commit -m "Release v1.5.0: Add process management, log viewer, file manager, service manager, and web terminal"

# 推送到main分支
git push origin main
```

### 3. 创建版本标签

```bash
# 创建带注释的标签
git tag -a v1.5.0 -m "AquaPanel v1.5.0

新增功能:
- 🔧 进程管理: 实时查看和管理系统进程
- 📋 日志查看: 应用和系统日志统一查看
- 📁 文件管理: 服务器文件系统浏览
- 🛠️ 服务管理: 系统服务启停控制
- 💻 Web终端: 在线命令执行终端

技术改进:
- 🔒 增强安全防护机制
- 📊 优化实时数据传输
- 🎨 完善UI交互体验
- 📱 全面响应式设计"

# 推送标签到远程仓库
git push origin v1.5.0
```

### 4. 在GitHub上创建Release

#### 方法1: 通过GitHub网页界面

1. 访问你的GitHub仓库页面
2. 点击右侧的 "Releases" 链接
3. 点击 "Create a new release" 按钮
4. 填写发布信息：

**Tag version:** `v1.5.0`

**Release title:** `AquaPanel v1.5.0 - 完整服务器管理平台`

**Description:**
```markdown
## 🎉 AquaPanel v1.5.0 - 完整服务器管理平台

### 🚀 重大更新

本版本将AquaPanel从基础监控面板升级为功能完整的服务器管理平台，新增五大核心功能模块。

### ✨ 新增功能

#### 🔧 进程管理
- 实时查看所有系统进程
- 按CPU和内存使用率筛选
- 进程详情查看和安全终止
- 自动刷新和实时更新

#### 📋 日志查看
- 应用日志和系统日志统一查看
- 支持关键词搜索和过滤
- 不同日志级别颜色标识
- 实时日志更新推送

#### 📁 文件管理
- 服务器文件系统浏览
- 支持目录导航和文件预览
- 显示文件权限和详细信息
- 安全路径限制机制

#### 🛠️ 服务管理
- 系统服务状态查看
- 支持启动、停止、重启操作
- 服务状态实时更新
- 操作确认对话框

#### 💻 Web终端
- 在线命令执行终端
- 命令历史记录和导航
- 常用命令快捷按钮
- 危险命令安全防护

### 🔒 安全增强

- 危险命令黑名单机制
- 文件访问路径白名单
- 详细操作审计日志
- 增强的权限验证

### 🎨 界面优化

- 保持液体玻璃设计风格
- 统一的蓝绿色主题
- 完善的响应式设计
- 流畅的交互动画

### 📊 技术统计

- 新增代码: 2100+ 行
- 新增模块: 5个核心功能
- API接口: 20+ 个新端点
- 安全特性: 多层防护机制

### 🚀 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | sudo bash
```

**访问地址:** `http://your-server-ip:3000`  
**默认用户:** `admin` / `admin123`

### 📝 升级说明

如果你已经安装了旧版本，可以使用以下命令升级：

```bash
aquapanel update
```

或重新安装：

```bash
aquapanel reinstall
```

### 🐛 已知问题

- 大量进程时的性能优化（规划中）
- 文件上传功能（下个版本）
- 更多文件类型预览（规划中）

### 📖 文档

- [完整文档](README.md)
- [开发总结](DEVELOPMENT_SUMMARY.md)
- [安装指南](README.md#快速开始)

---

**完整更新日志请查看 [DEVELOPMENT_SUMMARY.md](DEVELOPMENT_SUMMARY.md)**
```

5. 勾选 "This is a pre-release" 如果这是预发布版本（可选）
6. 点击 "Publish release"

#### 方法2: 使用GitHub CLI（如果已安装）

```bash
# 创建发布
gh release create v1.5.0 \
  --title "AquaPanel v1.5.0 - 完整服务器管理平台" \
  --notes-file RELEASE_NOTES.md
```

### 5. 验证发布

```bash
# 检查标签
git tag -l

# 检查远程标签
git ls-remote --tags origin

# 测试安装脚本
curl -fsSL https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | head -10
```

## 📢 发布后任务

### 1. 更新文档链接
确保所有文档中的链接指向正确的版本

### 2. 社交媒体宣传（可选）
- 在技术社区分享新版本
- 更新项目主页
- 通知用户群体

### 3. 监控反馈
- 关注GitHub Issues
- 收集用户反馈
- 监控安装统计

## 🔧 常见问题

### Q: 标签已存在怎么办？
```bash
# 删除本地标签
git tag -d v1.5.0

# 删除远程标签
git push --delete origin v1.5.0

# 重新创建标签
git tag -a v1.5.0 -m "Release message"
git push origin v1.5.0
```

### Q: 如何修改已发布的Release？
1. 在GitHub上进入Release页面
2. 点击要修改的Release
3. 点击 "Edit release" 按钮
4. 修改内容后点击 "Update release"

### Q: 如何删除错误的Release？
1. 进入Release页面
2. 点击要删除的Release
3. 点击 "Delete" 按钮
4. 确认删除

## 🎉 发布完成

恭喜！AquaPanel v1.5.0 现在已经成功发布。用户可以通过以下方式获取最新版本：

- **一键安装**: `curl -fsSL https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | sudo bash`
- **GitHub Release**: https://github.com/xieming1904/xiexieminaban/releases/tag/v1.5.0
- **项目主页**: https://github.com/xieming1904/xiexieminaban

记得在社区和用户群中宣传这个重大更新！🚀