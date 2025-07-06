#!/bin/bash

# AquaPanel 自动发布脚本
# 版本: 1.0.0

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

# 版本信息
CURRENT_VERSION="1.5.0"
RELEASE_TITLE="AquaPanel v1.5.0 - 完整服务器管理平台"

# 打印带颜色的消息
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}[发布工具] ${message}${NC}"
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
    echo -e "${WHITE}自动发布脚本 v${CURRENT_VERSION}${NC}"
    echo
}

# 检查环境
check_environment() {
    print_message $BLUE "检查发布环境..."
    
    # 检查是否在git仓库中
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_message $RED "错误: 当前目录不是git仓库"
        exit 1
    fi
    
    # 检查是否有未提交的更改
    if ! git diff-index --quiet HEAD --; then
        print_message $YELLOW "警告: 检测到未提交的更改"
        echo -e "${YELLOW}是否继续? (y/N)${NC}"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            print_message $RED "发布已取消"
            exit 1
        fi
    fi
    
    # 检查当前分支
    current_branch=$(git branch --show-current)
    if [ "$current_branch" != "main" ] && [ "$current_branch" != "master" ]; then
        print_message $YELLOW "警告: 当前不在main/master分支 (当前: $current_branch)"
        echo -e "${YELLOW}是否继续? (y/N)${NC}"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            print_message $RED "发布已取消"
            exit 1
        fi
    fi
    
    print_message $GREEN "环境检查通过"
}

# 检查版本
check_version() {
    print_message $BLUE "检查版本信息..."
    
    # 检查package.json中的版本
    if [ -f "package.json" ]; then
        package_version=$(grep '"version"' package.json | sed 's/.*"version": *"\([^"]*\)".*/\1/')
        if [ "$package_version" != "$CURRENT_VERSION" ]; then
            print_message $RED "错误: package.json版本不匹配 (期望: $CURRENT_VERSION, 实际: $package_version)"
            exit 1
        fi
    fi
    
    # 检查标签是否已存在
    if git tag -l | grep -q "^v$CURRENT_VERSION$"; then
        print_message $YELLOW "警告: 标签 v$CURRENT_VERSION 已存在"
        echo -e "${YELLOW}是否删除现有标签并重新创建? (y/N)${NC}"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            git tag -d "v$CURRENT_VERSION"
            git push --delete origin "v$CURRENT_VERSION" 2>/dev/null || true
            print_message $GREEN "已删除现有标签"
        else
            print_message $RED "发布已取消"
            exit 1
        fi
    fi
    
    print_message $GREEN "版本检查通过: v$CURRENT_VERSION"
}

# 构建和测试
build_and_test() {
    print_message $BLUE "执行构建和基础检查..."
    
    # 检查必要文件
    required_files=("package.json" "app.js" "README.md" "install.sh")
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            print_message $RED "错误: 缺少必要文件 $file"
            exit 1
        fi
    done
    
    # 检查Node.js依赖
    if [ -f "package.json" ]; then
        print_message $BLUE "检查依赖..."
        if command -v npm &> /dev/null; then
            npm install --dry-run > /dev/null 2>&1 || {
                print_message $RED "错误: npm依赖检查失败"
                exit 1
            }
        fi
    fi
    
    print_message $GREEN "构建检查通过"
}

# 提交和推送
commit_and_push() {
    print_message $BLUE "提交最新更改..."
    
    # 添加所有文件
    git add .
    
    # 检查是否有更改需要提交
    if git diff-index --quiet HEAD --; then
        print_message $YELLOW "没有新的更改需要提交"
    else
        # 提交更改
        commit_msg="Release v$CURRENT_VERSION: Add process management, log viewer, file manager, service manager, and web terminal

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

        git commit -m "$commit_msg"
        print_message $GREEN "更改已提交"
    fi
    
    # 推送到远程仓库
    print_message $BLUE "推送到远程仓库..."
    git push origin HEAD
    print_message $GREEN "代码已推送"
}

# 创建标签
create_tag() {
    print_message $BLUE "创建版本标签..."
    
    tag_msg="AquaPanel v$CURRENT_VERSION

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

    git tag -a "v$CURRENT_VERSION" -m "$tag_msg"
    git push origin "v$CURRENT_VERSION"
    
    print_message $GREEN "标签 v$CURRENT_VERSION 已创建并推送"
}

# 创建GitHub Release
create_github_release() {
    print_message $BLUE "创建GitHub Release..."
    
    # 检查是否安装了GitHub CLI
    if command -v gh &> /dev/null; then
        print_message $BLUE "使用GitHub CLI创建Release..."
        
        if [ -f "RELEASE_NOTES.md" ]; then
            gh release create "v$CURRENT_VERSION" \
                --title "$RELEASE_TITLE" \
                --notes-file RELEASE_NOTES.md
            print_message $GREEN "GitHub Release已创建"
        else
            gh release create "v$CURRENT_VERSION" \
                --title "$RELEASE_TITLE" \
                --notes "AquaPanel v$CURRENT_VERSION 发布

请查看完整的发布说明：
https://github.com/xieming1904/xiexieminaban/blob/main/RELEASE_GUIDE.md"
            print_message $GREEN "GitHub Release已创建"
        fi
    else
        print_message $YELLOW "GitHub CLI未安装，请手动创建Release"
        print_message $CYAN "访问: https://github.com/xieming1904/xiexieminaban/releases/new"
        print_message $CYAN "标签: v$CURRENT_VERSION"
        print_message $CYAN "标题: $RELEASE_TITLE"
    fi
}

# 验证发布
verify_release() {
    print_message $BLUE "验证发布..."
    
    # 检查标签
    if git tag -l | grep -q "^v$CURRENT_VERSION$"; then
        print_message $GREEN "✓ 本地标签存在"
    else
        print_message $RED "✗ 本地标签不存在"
    fi
    
    # 检查远程标签
    if git ls-remote --tags origin | grep -q "refs/tags/v$CURRENT_VERSION"; then
        print_message $GREEN "✓ 远程标签存在"
    else
        print_message $RED "✗ 远程标签不存在"
    fi
    
    # 测试安装脚本
    print_message $BLUE "测试安装脚本..."
    if curl -fsSL "https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh" --connect-timeout 10 | head -10 > /dev/null 2>&1; then
        print_message $GREEN "✓ 安装脚本可访问"
    else
        print_message $YELLOW "⚠ 安装脚本测试失败 (可能是网络问题)"
    fi
}

# 显示发布信息
show_release_info() {
    clear
    print_message $GREEN "🎉 发布完成！"
    echo
    echo -e "${WHITE}===============================================${NC}"
    echo -e "${WHITE}        AquaPanel v$CURRENT_VERSION 发布信息${NC}"
    echo -e "${WHITE}===============================================${NC}"
    echo
    
    echo -e "${CYAN}🏷️  版本标签:${NC} v$CURRENT_VERSION"
    echo -e "${CYAN}📦 GitHub Release:${NC} https://github.com/xieming1904/xiexieminaban/releases/tag/v$CURRENT_VERSION"
    echo -e "${CYAN}📥 一键安装:${NC} curl -fsSL https://raw.githubusercontent.com/xieming1904/xiexieminaban/main/install.sh | sudo bash"
    echo
    echo -e "${WHITE}📋 发布后任务:${NC}"
    echo -e "${YELLOW}  1. 检查GitHub Release页面${NC}"
    echo -e "${YELLOW}  2. 测试安装脚本${NC}"
    echo -e "${YELLOW}  3. 在社区分享新版本${NC}"
    echo -e "${YELLOW}  4. 监控用户反馈${NC}"
    echo
    echo -e "${WHITE}===============================================${NC}"
    echo
}

# 主流程
main() {
    clear
    print_header
    
    print_message $BLUE "开始AquaPanel v$CURRENT_VERSION发布流程..."
    echo
    
    # 检查环境
    check_environment
    
    # 检查版本
    check_version
    
    # 构建和测试
    build_and_test
    
    # 确认发布
    echo -e "${WHITE}准备发布 AquaPanel v$CURRENT_VERSION${NC}"
    echo -e "${YELLOW}是否继续? (y/N)${NC}"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        print_message $RED "发布已取消"
        exit 1
    fi
    
    # 提交和推送
    commit_and_push
    
    # 创建标签
    create_tag
    
    # 创建GitHub Release
    create_github_release
    
    # 验证发布
    verify_release
    
    # 显示发布信息
    show_release_info
}

# 检查参数
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "AquaPanel 自动发布脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示帮助信息"
    echo "  --version      显示版本信息"
    echo ""
    echo "功能:"
    echo "  - 自动检查环境和版本"
    echo "  - 提交代码并推送到远程仓库"
    echo "  - 创建和推送版本标签"
    echo "  - 创建GitHub Release"
    echo "  - 验证发布结果"
    echo ""
    exit 0
fi

if [ "$1" = "--version" ]; then
    echo "AquaPanel 发布脚本 v1.0.0"
    echo "目标版本: v$CURRENT_VERSION"
    exit 0
fi

# 运行主流程
main "$@"