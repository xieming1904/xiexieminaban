#!/bin/bash

# AquaPanel 安装脚本
# 版本: 1.0.0
# 作者: AquaPanel Team

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
        exit 1
    fi
    
    # 检查网络连接
    if ! ping -c 1 google.com &> /dev/null; then
        print_message $YELLOW "警告: 网络连接可能有问题，继续安装..."
    fi
}

# 安装依赖
install_dependencies() {
    print_message $BLUE "安装系统依赖..."
    
    if [ "$OS" == "debian" ]; then
        apt-get update
        apt-get install -y curl wget gnupg2 software-properties-common
    elif [ "$OS" == "redhat" ]; then
        yum update -y
        yum install -y curl wget gnupg2
    fi
    
    # 安装 Node.js
    print_message $BLUE "安装 Node.js..."
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        if [ "$OS" == "debian" ]; then
            apt-get install -y nodejs
        elif [ "$OS" == "redhat" ]; then
            yum install -y nodejs npm
        fi
    else
        print_message $GREEN "Node.js 已安装"
    fi
    
    # 检查 Node.js 版本
    NODE_VERSION=$(node --version)
    print_message $GREEN "Node.js 版本: $NODE_VERSION"
    
    # 安装 PM2
    print_message $BLUE "安装 PM2..."
    if ! command -v pm2 &> /dev/null; then
        npm install -g pm2
    else
        print_message $GREEN "PM2 已安装"
    fi
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

# 创建目录
create_directories() {
    print_message $BLUE "创建应用目录..."
    
    # 创建主目录
    mkdir -p $APP_DIR
    mkdir -p $APP_DIR/logs
    mkdir -p $APP_DIR/data
    mkdir -p $APP_DIR/backups
    
    # 复制应用文件
    print_message $BLUE "复制应用文件..."
    cp -r . $APP_DIR/
    
    # 设置权限
    chown -R $SERVICE_USER:$SERVICE_USER $APP_DIR
    chmod -R 755 $APP_DIR
    chmod -R 644 $APP_DIR/data
    
    print_message $GREEN "目录创建完成"
}

# 安装应用依赖
install_app_dependencies() {
    print_message $BLUE "安装应用依赖..."
    
    cd $APP_DIR
    npm install --production
    
    print_message $GREEN "应用依赖安装完成"
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
        ufw allow $DEFAULT_PORT/tcp
        print_message $GREEN "UFW 防火墙规则已添加"
    fi
    
    # firewalld (CentOS/RHEL)
    if command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=$DEFAULT_PORT/tcp
        firewall-cmd --reload
        print_message $GREEN "firewalld 防火墙规则已添加"
    fi
    
    # iptables (通用)
    if command -v iptables &> /dev/null; then
        iptables -I INPUT -p tcp --dport $DEFAULT_PORT -j ACCEPT
        # 保存规则
        if [ "$OS" == "debian" ]; then
            iptables-save > /etc/iptables/rules.v4
        elif [ "$OS" == "redhat" ]; then
            service iptables save
        fi
        print_message $GREEN "iptables 防火墙规则已添加"
    fi
}

# 创建配置文件
create_config() {
    print_message $BLUE "创建配置文件..."
    
    cat > $APP_DIR/config.json << EOF
{
  "port": $DEFAULT_PORT,
  "jwt_secret": "$(openssl rand -hex 32)",
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
        systemctl status $SERVICE_NAME
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
        cp -r $APP_DIR/data/* $backup_dir/
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
    uninstall)
        echo "确定要卸载 AquaPanel 吗? (y/N)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            systemctl stop $SERVICE_NAME
            systemctl disable $SERVICE_NAME
            rm -f /etc/systemd/system/$SERVICE_NAME.service
            rm -rf $APP_DIR
            userdel aquapanel
            rm -f /usr/local/bin/aquapanel
            echo "AquaPanel 已卸载"
        fi
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|logs|backup|update|uninstall}"
        exit 1
        ;;
esac
EOF

    chmod +x /usr/local/bin/aquapanel
    print_message $GREEN "管理脚本创建完成"
}

# 显示安装信息
show_installation_info() {
    print_message $GREEN "安装完成！"
    echo
    echo -e "${WHITE}===============================================${NC}"
    echo -e "${WHITE}          AquaPanel 安装信息${NC}"
    echo -e "${WHITE}===============================================${NC}"
    echo
    echo -e "${CYAN}访问地址:${NC} http://$(hostname -I | awk '{print $1}'):$DEFAULT_PORT"
    echo -e "${CYAN}默认用户名:${NC} admin"
    echo -e "${CYAN}默认密码:${NC} admin123"
    echo
    echo -e "${WHITE}管理命令:${NC}"
    echo -e "${YELLOW}  aquapanel start${NC}     - 启动服务"
    echo -e "${YELLOW}  aquapanel stop${NC}      - 停止服务"
    echo -e "${YELLOW}  aquapanel restart${NC}   - 重启服务"
    echo -e "${YELLOW}  aquapanel status${NC}    - 查看状态"
    echo -e "${YELLOW}  aquapanel logs${NC}      - 查看日志"
    echo -e "${YELLOW}  aquapanel backup${NC}    - 创建备份"
    echo -e "${YELLOW}  aquapanel update${NC}    - 更新系统"
    echo -e "${YELLOW}  aquapanel uninstall${NC} - 卸载系统"
    echo
    echo -e "${WHITE}文件位置:${NC}"
    echo -e "${CYAN}  应用目录:${NC} $APP_DIR"
    echo -e "${CYAN}  数据目录:${NC} $APP_DIR/data"
    echo -e "${CYAN}  日志目录:${NC} $APP_DIR/logs"
    echo -e "${CYAN}  备份目录:${NC} $APP_DIR/backups"
    echo
    echo -e "${WHITE}===============================================${NC}"
    echo
    echo -e "${GREEN}请访问面板地址进行初始化设置${NC}"
    echo -e "${YELLOW}建议首次登录后立即修改默认密码${NC}"
    echo
}

# 主安装流程
main() {
    clear
    print_header
    
    # 检查系统
    check_system
    
    # 安装依赖
    install_dependencies
    
    # 创建用户
    create_user
    
    # 创建目录
    create_directories
    
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
    
    # 显示安装信息
    show_installation_info
}

# 运行主流程
main