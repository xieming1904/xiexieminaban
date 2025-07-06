#!/bin/bash

# AquaPanel 在线安装脚本
# 版本: 1.5.0
# 作者: AquaPanel Team
# GitHub: https://github.com/xieming1904/xiexieminaban

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# 常量定义
APP_NAME="AquaPanel"
APP_DIR="/opt/aquapanel"
SERVICE_NAME="aquapanel"
SERVICE_USER="aquapanel"
DEFAULT_PORT=3000
GITHUB_REPO="https://github.com/xieming1904/xiexieminaban.git"
GITHUB_BRANCH="main"

# 打印带颜色的消息
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}[${APP_NAME}] ${message}${NC}"
}

print_header() {
    echo -e "${CYAN}"
    echo "  █████╗  ██████╗ ██╗   ██╗ █████╗ ██████╗  █████╗ ███╗   ██╗███████╗██╗     "
    echo " ██╔══██╗██╔═══██╗██║   ██║██╔══██╗██╔══██╗██╔══██╗████╗  ██║██╔════╝██║     "
    echo " ███████║██║   ██║██║   ██║███████║██████╔╝███████║██╔██╗ ██║█████╗  ██║     "
    echo " ██╔══██║██║▄▄ ██║██║   ██║██╔══██║██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║     "
    echo " ██║  ██║╚██████╔╝╚██████╔╝██║  ██║██║     ██║  ██║██║ ╚████║███████╗███████╗"
    echo " ╚═╝  ╚═╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝"
    echo -e "${NC}"
    echo -e "${WHITE}现代化服务器面板 - 液体玻璃设计${NC}"
    echo -e "${CYAN}GitHub: https://github.com/xieming1904/xiexieminaban${NC}"
    echo
}

# 检查系统环境
check_system() {
    print_message $BLUE "检查系统环境..."
    
    # 检查操作系统
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/debian_version ]; then
            OS="debian"
            print_message $GREEN "检测到 Debian/Ubuntu 系统"
        elif [ -f /etc/redhat-release ]; then
            OS="redhat"
            print_message $GREEN "检测到 RedHat/CentOS 系统"
        else
            print_message $YELLOW "未知的 Linux 发行版，尝试继续安装..."
            OS="unknown"
        fi
    else
        print_message $RED "错误: 不支持的操作系统"
        exit 1
    fi
    
    # 检查是否为root用户
    if [[ $EUID -ne 0 ]]; then
        print_message $RED "错误: 请使用 root 用户运行此脚本"
        print_message $YELLOW "请使用: sudo bash install.sh"
        exit 1
    fi
    
    # 检查网络连接
    print_message $BLUE "检查网络连接..."
    if ! ping -c 1 github.com &> /dev/null; then
        print_message $RED "错误: 无法连接到 GitHub，请检查网络连接"
        exit 1
    fi
    
    print_message $GREEN "网络连接正常"
}

# 安装系统依赖
install_dependencies() {
    print_message $BLUE "安装系统依赖..."
    
    if [ "$OS" == "debian" ]; then
        apt-get update
        apt-get install -y curl wget git gnupg2 software-properties-common unzip
    elif [ "$OS" == "redhat" ]; then
        yum update -y
        yum install -y curl wget git gnupg2 unzip
    fi
    
    # 安装 Node.js
    print_message $BLUE "安装 Node.js..."
    if ! command -v node &> /dev/null; then
        # 使用 NodeSource 仓库安装 Node.js
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        if [ "$OS" == "debian" ]; then
            apt-get install -y nodejs
        elif [ "$OS" == "redhat" ]; then
            # CentOS/RHEL 使用不同的安装方式
            curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
            yum install -y nodejs
        fi
    else
        print_message $GREEN "Node.js 已安装"
    fi
    
    # 检查 Node.js 版本
    NODE_VERSION=$(node --version)
    print_message $GREEN "Node.js 版本: $NODE_VERSION"
    
    # 检查版本是否符合要求 (>=16)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 16 ]; then
        print_message $RED "错误: Node.js 版本过低，需要 v16.0.0 或更高版本"
        exit 1
    fi
    
    # 安装 PM2（可选）
    if ! command -v pm2 &> /dev/null; then
        print_message $BLUE "安装 PM2..."
        npm install -g pm2
    else
        print_message $GREEN "PM2 已安装"
    fi
}

# 下载项目代码
download_project() {
    print_message $BLUE "从 GitHub 下载项目代码..."
    
    # 如果目录已存在，先删除
    if [ -d "$APP_DIR" ]; then
        print_message $YELLOW "检测到已存在的安装目录，正在备份..."
        if [ -d "${APP_DIR}.backup" ]; then
            rm -rf "${APP_DIR}.backup"
        fi
        mv "$APP_DIR" "${APP_DIR}.backup"
        print_message $GREEN "已备份到 ${APP_DIR}.backup"
    fi
    
    # 克隆项目
    print_message $BLUE "正在克隆项目: $GITHUB_REPO"
    if git clone -b $GITHUB_BRANCH $GITHUB_REPO $APP_DIR; then
        print_message $GREEN "项目下载成功"
    else
        print_message $RED "项目下载失败"
        # 尝试恢复备份
        if [ -d "${APP_DIR}.backup" ]; then
            mv "${APP_DIR}.backup" "$APP_DIR"
            print_message $YELLOW "已恢复备份"
        fi
        exit 1
    fi
    
    # 切换到项目目录
    cd $APP_DIR
}

# 创建用户
create_user() {
    print_message $BLUE "创建应用用户..."
    
    if ! id "$SERVICE_USER" &>/dev/null; then
        useradd -r -s /bin/false -d $APP_DIR $SERVICE_USER
        print_message $GREEN "用户 $SERVICE_USER 创建成功"
    else
        print_message $GREEN "用户 $SERVICE_USER 已存在"
    fi
}

# 设置目录权限
setup_permissions() {
    print_message $BLUE "设置目录权限..."
    
    # 创建必要的目录
    mkdir -p $APP_DIR/logs
    mkdir -p $APP_DIR/data
    mkdir -p $APP_DIR/backups
    
    # 设置权限
    chown -R $SERVICE_USER:$SERVICE_USER $APP_DIR
    chmod -R 755 $APP_DIR
    chmod -R 644 $APP_DIR/data
    
    print_message $GREEN "权限设置完成"
}

# 安装应用依赖
install_app_dependencies() {
    print_message $BLUE "安装应用依赖..."
    
    cd $APP_DIR
    
    # 检查是否存在 package.json
    if [ ! -f "package.json" ]; then
        print_message $RED "错误: 未找到 package.json 文件"
        exit 1
    fi
    
    # 安装依赖
    if npm install --production; then
        print_message $GREEN "应用依赖安装完成"
    else
        print_message $RED "应用依赖安装失败"
        exit 1
    fi
}

# 配置服务
configure_service() {
    print_message $BLUE "配置系统服务..."
    
    # 创建 systemd 服务文件
    cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=AquaPanel Server Management Panel
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node $APP_DIR/app.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=$DEFAULT_PORT

# 日志
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$APP_DIR/data $APP_DIR/logs

[Install]
WantedBy=multi-user.target
EOF

    # 重载 systemd
    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    
    print_message $GREEN "系统服务配置完成"
}

# 配置防火墙
configure_firewall() {
    print_message $BLUE "配置防火墙..."
    
    # UFW (Ubuntu/Debian)
    if command -v ufw &> /dev/null; then
        if ufw status | grep -q "Status: active"; then
            ufw allow $DEFAULT_PORT/tcp
            print_message $GREEN "UFW 防火墙规则已添加"
        fi
    fi
    
    # firewalld (CentOS/RHEL)
    if command -v firewall-cmd &> /dev/null; then
        if systemctl is-active --quiet firewalld; then
            firewall-cmd --permanent --add-port=$DEFAULT_PORT/tcp
            firewall-cmd --reload
            print_message $GREEN "firewalld 防火墙规则已添加"
        fi
    fi
    
    print_message $YELLOW "请确保端口 $DEFAULT_PORT 在防火墙中已开放"
}

# 创建配置文件
create_config() {
    print_message $BLUE "创建配置文件..."
    
    # 生成随机JWT密钥
    JWT_SECRET=$(openssl rand -hex 32)
    
    cat > $APP_DIR/config.json << EOF
{
  "port": $DEFAULT_PORT,
  "jwt_secret": "$JWT_SECRET",
  "data_dir": "$APP_DIR/data",
  "logs_dir": "$APP_DIR/logs",
  "backups_dir": "$APP_DIR/backups",
  "update_interval": 2000,
  "max_history_points": 60,
  "security": {
    "session_timeout": 86400,
    "max_login_attempts": 5,
    "lockout_time": 900
  }
}
EOF
    
    chown $SERVICE_USER:$SERVICE_USER $APP_DIR/config.json
    chmod 600 $APP_DIR/config.json
    
    print_message $GREEN "配置文件创建完成"
}

# 启动服务
start_service() {
    print_message $BLUE "启动服务..."
    
    systemctl start $SERVICE_NAME
    sleep 3
    
    if systemctl is-active --quiet $SERVICE_NAME; then
        print_message $GREEN "服务启动成功"
    else
        print_message $RED "服务启动失败"
        print_message $YELLOW "查看错误日志:"
        journalctl -u $SERVICE_NAME --no-pager -n 10
        exit 1
    fi
}

# 创建管理脚本
create_management_script() {
    print_message $BLUE "创建管理脚本..."
    
    cat > /usr/local/bin/aquapanel << 'EOF'
#!/bin/bash

SERVICE_NAME="aquapanel"
APP_DIR="/opt/aquapanel"
GITHUB_REPO="https://github.com/xieming1904/xiexieminaban.git"

case "$1" in
    start)
        systemctl start $SERVICE_NAME
        echo "AquaPanel 已启动"
        ;;
    stop)
        systemctl stop $SERVICE_NAME
        echo "AquaPanel 已停止"
        ;;
    restart)
        systemctl restart $SERVICE_NAME
        echo "AquaPanel 已重启"
        ;;
    status)
        systemctl status $SERVICE_NAME
        ;;
    logs)
        journalctl -u $SERVICE_NAME -f
        ;;
    backup)
        backup_dir="$APP_DIR/backups/backup_$(date +%Y%m%d_%H%M%S)"
        mkdir -p $backup_dir
        cp -r $APP_DIR/data/* $backup_dir/ 2>/dev/null || true
        echo "备份已创建: $backup_dir"
        ;;
    update)
        echo "更新 AquaPanel..."
        systemctl stop $SERVICE_NAME
        cd $APP_DIR
        git pull origin main
        npm install --production
        systemctl start $SERVICE_NAME
        echo "更新完成"
        ;;
    reinstall)
        echo "重新安装 AquaPanel..."
        curl -fsSL https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | bash
        ;;
    uninstall)
        echo "确定要卸载 AquaPanel 吗? (y/N)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            systemctl stop $SERVICE_NAME
            systemctl disable $SERVICE_NAME
            rm -f /etc/systemd/system/$SERVICE_NAME.service
            systemctl daemon-reload
            rm -rf $APP_DIR
            userdel aquapanel 2>/dev/null || true
            rm -f /usr/local/bin/aquapanel
            echo "AquaPanel 已卸载"
        fi
        ;;
    *)
        echo "AquaPanel 管理工具"
        echo ""
        echo "用法: $0 {start|stop|restart|status|logs|backup|update|reinstall|uninstall}"
        echo ""
        echo "命令说明:"
        echo "  start     - 启动服务"
        echo "  stop      - 停止服务"
        echo "  restart   - 重启服务"
        echo "  status    - 查看状态"
        echo "  logs      - 查看实时日志"
        echo "  backup    - 创建数据备份"
        echo "  update    - 更新到最新版本"
        echo "  reinstall - 重新安装"
        echo "  uninstall - 卸载系统"
        exit 1
        ;;
esac
EOF

    chmod +x /usr/local/bin/aquapanel
    print_message $GREEN "管理脚本创建完成"
}

# 检查服务状态
check_service() {
    print_message $BLUE "检查服务状态..."
    
    # 检查端口是否被占用
    if ss -tlnp | grep -q ":$DEFAULT_PORT "; then
        print_message $GREEN "服务端口 $DEFAULT_PORT 正在监听"
    else
        print_message $YELLOW "警告: 端口 $DEFAULT_PORT 未在监听"
    fi
    
    # 测试HTTP连接
    if curl -s --connect-timeout 5 http://localhost:$DEFAULT_PORT >/dev/null; then
        print_message $GREEN "HTTP服务响应正常"
    else
        print_message $YELLOW "警告: HTTP服务可能未正常运行"
    fi
}

# 显示安装信息
show_installation_info() {
    clear
    print_message $GREEN "🎉 安装完成！"
    echo
    echo -e "${WHITE}===============================================${NC}"
    echo -e "${WHITE}          AquaPanel 安装信息${NC}"
    echo -e "${WHITE}===============================================${NC}"
    echo
    
    # 获取服务器IP
    SERVER_IP=$(hostname -I | awk '{print $1}')
    if [ -z "$SERVER_IP" ]; then
        SERVER_IP="your-server-ip"
    fi
    
    echo -e "${CYAN}🌐 访问地址:${NC} http://$SERVER_IP:$DEFAULT_PORT"
    echo -e "${CYAN}👤 默认用户名:${NC} admin"
    echo -e "${CYAN}🔑 默认密码:${NC} admin123"
    echo
    echo -e "${WHITE}🛠️  管理命令:${NC}"
    echo -e "${YELLOW}  aquapanel start${NC}       - 启动服务"
    echo -e "${YELLOW}  aquapanel stop${NC}        - 停止服务"
    echo -e "${YELLOW}  aquapanel restart${NC}     - 重启服务"
    echo -e "${YELLOW}  aquapanel status${NC}      - 查看状态"
    echo -e "${YELLOW}  aquapanel logs${NC}        - 查看日志"
    echo -e "${YELLOW}  aquapanel backup${NC}      - 创建备份"
    echo -e "${YELLOW}  aquapanel update${NC}      - 更新系统"
    echo -e "${YELLOW}  aquapanel reinstall${NC}   - 重新安装"
    echo -e "${YELLOW}  aquapanel uninstall${NC}   - 卸载系统"
    echo
    echo -e "${WHITE}📁 文件位置:${NC}"
    echo -e "${CYAN}  应用目录:${NC} $APP_DIR"
    echo -e "${CYAN}  数据目录:${NC} $APP_DIR/data"
    echo -e "${CYAN}  日志目录:${NC} $APP_DIR/logs"
    echo -e "${CYAN}  备份目录:${NC} $APP_DIR/backups"
    echo
    echo -e "${WHITE}📖 项目地址:${NC}"
    echo -e "${CYAN}  GitHub:${NC} https://github.com/xieming1904/xiexieminaban"
    echo
    echo -e "${WHITE}===============================================${NC}"
    echo
    echo -e "${GREEN}✅ 请访问面板地址进行初始化设置${NC}"
    echo -e "${YELLOW}⚠️  建议首次登录后立即修改默认密码${NC}"
    echo -e "${BLUE}📚 查看完整文档: aquapanel status${NC}"
    echo
}

# 主安装流程
main() {
    clear
    print_header
    
    print_message $BLUE "开始安装 AquaPanel..."
    echo
    
    # 检查系统
    check_system
    
    # 安装依赖
    install_dependencies
    
    # 下载项目
    download_project
    
    # 创建用户
    create_user
    
    # 设置权限
    setup_permissions
    
    # 安装应用依赖
    install_app_dependencies
    
    # 创建配置文件
    create_config
    
    # 配置服务
    configure_service
    
    # 配置防火墙
    configure_firewall
    
    # 创建管理脚本
    create_management_script
    
    # 启动服务
    start_service
    
    # 检查服务状态
    check_service
    
    # 显示安装信息
    show_installation_info
}

# 运行主流程
main "$@"