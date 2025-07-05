# AquaPanel 快速安装指南

## 🚀 一键安装命令

### 方式一：使用 curl（推荐）
```bash
curl -fsSL https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | sudo bash
```

### 方式二：使用 wget
```bash
wget -qO- https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | sudo bash
```

### 方式三：下载后安装
```bash
# 下载安装脚本
wget https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh

# 添加执行权限
chmod +x install.sh

# 运行安装脚本
sudo ./install.sh
```

## 📋 安装要求

- **操作系统**: Linux（Ubuntu/Debian/CentOS/RHEL）
- **权限**: 需要 root 或 sudo 权限
- **网络**: 能够访问 GitHub 和 npm 仓库
- **内存**: 最低 512MB，推荐 1GB+
- **磁盘**: 最低 1GB 可用空间

## ⚡ 安装过程

安装脚本将自动完成以下步骤：

1. ✅ **检查系统环境** - 验证操作系统和网络连接
2. ✅ **安装系统依赖** - 安装 Node.js、Git 等必要组件
3. ✅ **下载项目代码** - 从 GitHub 克隆最新代码
4. ✅ **创建系统用户** - 创建专用的 aquapanel 用户
5. ✅ **安装应用依赖** - 安装 Node.js 项目依赖
6. ✅ **配置系统服务** - 设置 systemd 服务
7. ✅ **配置防火墙** - 开放必要端口
8. ✅ **启动服务** - 启动 AquaPanel 服务

## 🎯 安装完成后

### 访问面板
- **地址**: `http://your-server-ip:3000`
- **用户名**: `admin`
- **密码**: `admin123`

### 管理命令
```bash
aquapanel start      # 启动服务
aquapanel stop       # 停止服务
aquapanel restart    # 重启服务
aquapanel status     # 查看状态
aquapanel logs       # 查看日志
aquapanel update     # 更新到最新版本
aquapanel backup     # 创建数据备份
aquapanel uninstall  # 卸载系统
```

## 🔧 故障排除

### 常见问题

1. **网络连接问题**
   ```bash
   # 检查是否能访问 GitHub
   ping github.com
   
   # 检查防火墙状态
   sudo ufw status
   ```

2. **权限问题**
   ```bash
   # 确保使用 sudo 运行
   sudo curl -fsSL https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | bash
   ```

3. **端口被占用**
   ```bash
   # 检查端口使用情况
   sudo netstat -tlnp | grep :3000
   
   # 或使用 ss 命令
   sudo ss -tlnp | grep :3000
   ```

4. **服务启动失败**
   ```bash
   # 查看服务状态
   sudo systemctl status aquapanel
   
   # 查看详细日志
   sudo journalctl -u aquapanel -f
   ```

### 重新安装
如果安装失败或需要重新安装：
```bash
# 使用管理命令重新安装
aquapanel reinstall

# 或直接运行安装脚本
curl -fsSL https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | sudo bash
```

### 完全卸载
```bash
# 卸载系统
aquapanel uninstall

# 手动清理（如果需要）
sudo rm -rf /opt/aquapanel
sudo userdel aquapanel
sudo rm -f /usr/local/bin/aquapanel
sudo rm -f /etc/systemd/system/aquapanel.service
sudo systemctl daemon-reload
```

## 🔒 安全建议

1. **修改默认密码**
   - 首次登录后立即修改默认密码

2. **配置防火墙**
   ```bash
   # Ubuntu/Debian
   sudo ufw allow 3000/tcp
   sudo ufw enable
   
   # CentOS/RHEL
   sudo firewall-cmd --permanent --add-port=3000/tcp
   sudo firewall-cmd --reload
   ```

3. **使用 HTTPS**
   - 建议配置 Nginx 反向代理并启用 SSL

4. **定期更新**
   ```bash
   # 更新到最新版本
   aquapanel update
   ```

## 📞 获取帮助

- **GitHub Issues**: [https://github.com/xieming1904/xiexieminaban/issues](https://github.com/xieming1904/xiexieminaban/issues)
- **项目文档**: [README.md](https://github.com/xieming1904/xiexieminaban/blob/main/README.md)
- **技术栈**: [TECH_STACK.md](https://github.com/xieming1904/xiexieminaban/blob/main/TECH_STACK.md)

---

## 🎉 快速体验

想要快速体验 AquaPanel？只需要一行命令：

```bash
curl -fsSL https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | sudo bash
```

几分钟后，访问 `http://your-server-ip:3000` 即可开始使用！

---

<div align="center">
Made with ❤️ by AquaPanel Team
</div>