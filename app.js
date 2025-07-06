const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const si = require('systeminformation');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const util = require('util');
const os = require('os');
const dns = require('dns');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 将exec转换为Promise
const execAsync = util.promisify(exec);

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'aqua-panel-secret-key';

// 用户数据存储文件
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const LOGS_FILE = path.join(__dirname, 'data', 'logs.json');

// 确保数据目录存在
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}

// 初始化用户数据
let users = {};
if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
} else {
    // 创建默认管理员用户
    users.admin = {
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        created: new Date().toISOString()
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// 系统信息缓存
let systemInfo = {};

// 日志记录函数
function logActivity(username, action, details = '') {
    const logEntry = {
        timestamp: new Date().toISOString(),
        username,
        action,
        details,
        ip: 'system'
    };
    
    let logs = [];
    if (fs.existsSync(LOGS_FILE)) {
        try {
            logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
        } catch (err) {
            logs = [];
        }
    }
    
    logs.unshift(logEntry);
    // 保留最近1000条日志
    if (logs.length > 1000) {
        logs = logs.slice(0, 1000);
    }
    
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
}

// 获取系统信息
async function getSystemInfo() {
    try {
        const [cpu, mem, disk, network, os] = await Promise.all([
            si.cpu(),
            si.mem(),
            si.fsSize(),
            si.networkInterfaces(),
            si.osInfo()
        ]);
        
        return {
            cpu: {
                model: cpu.model,
                cores: cpu.cores,
                speed: cpu.speed
            },
            memory: {
                total: mem.total,
                used: mem.used,
                free: mem.free,
                usage: ((mem.used / mem.total) * 100).toFixed(2)
            },
            disk: disk.map(d => ({
                filesystem: d.fs,
                size: d.size,
                used: d.used,
                available: d.available,
                usage: d.use
            })),
            network: network.filter(n => !n.internal).map(n => ({
                interface: n.iface,
                ip: n.ip4,
                mac: n.mac,
                speed: n.speed
            })),
            os: {
                platform: os.platform,
                distro: os.distro,
                release: os.release,
                hostname: os.hostname,
                uptime: os.uptime
            }
        };
    } catch (error) {
        console.error('获取系统信息失败:', error);
        return null;
    }
}

// 获取实时性能数据
async function getPerformanceData() {
    try {
        const [cpuLoad, mem, networkStats] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.networkStats()
        ]);
        
        return {
            cpu: {
                usage: cpuLoad.currentLoad.toFixed(2),
                user: cpuLoad.currentLoadUser.toFixed(2),
                system: cpuLoad.currentLoadSystem.toFixed(2)
            },
            memory: {
                total: mem.total,
                used: mem.used,
                free: mem.free,
                usage: ((mem.used / mem.total) * 100).toFixed(2)
            },
            network: networkStats.map(n => ({
                interface: n.iface,
                rx: n.rx_bytes,
                tx: n.tx_bytes,
                rx_sec: n.rx_sec,
                tx_sec: n.tx_sec
            })),
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('获取性能数据失败:', error);
        return null;
    }
}

// 获取进程列表
async function getProcessList() {
    try {
        const processes = await si.processes();
        return processes.list.map(p => ({
            pid: p.pid,
            name: p.name,
            cpu: p.cpu,
            mem: p.mem,
            memVsz: p.memVsz,
            memRss: p.memRss,
            nice: p.nice,
            started: p.started,
            state: p.state,
            tty: p.tty,
            user: p.user,
            command: p.command
        })).sort((a, b) => b.cpu - a.cpu);
    } catch (error) {
        console.error('获取进程列表失败:', error);
        return [];
    }
}

// 身份验证中间件
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: '访问令牌未提供' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: '令牌无效' });
        }
        req.user = user;
        next();
    });
}

// 路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 登录接口
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    
    if (!users[username]) {
        logActivity('unknown', 'failed_login', `用户不存在: ${username}, IP: ${clientIP}`);
        return res.status(401).json({ error: '用户不存在' });
    }
    
    if (!bcrypt.compareSync(password, users[username].password)) {
        logActivity(username, 'failed_login', `密码错误, IP: ${clientIP}`);
        return res.status(401).json({ error: '密码错误' });
    }
    
    const token = jwt.sign(
        { username, role: users[username].role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
    
    logActivity(username, 'login', `成功登录, IP: ${clientIP}`);
    res.json({ token, user: { username, role: users[username].role } });
});

// 获取系统信息接口
app.get('/api/system-info', authenticateToken, async (req, res) => {
    const info = await getSystemInfo();
    if (info) {
        res.json(info);
    } else {
        res.status(500).json({ error: '获取系统信息失败' });
    }
});

// 获取性能数据接口
app.get('/api/performance', authenticateToken, async (req, res) => {
    const data = await getPerformanceData();
    if (data) {
        res.json(data);
    } else {
        res.status(500).json({ error: '获取性能数据失败' });
    }
});

// 获取进程列表接口
app.get('/api/processes', authenticateToken, async (req, res) => {
    try {
        const processes = await getProcessList();
        res.json({ processes });
    } catch (error) {
        res.status(500).json({ error: '获取进程列表失败' });
    }
});

// 结束进程接口
app.post('/api/processes/:pid/kill', authenticateToken, async (req, res) => {
    const { pid } = req.params;
    const { signal = 'SIGTERM' } = req.body;
    
    try {
        await execAsync(`kill -${signal} ${pid}`);
        logActivity(req.user.username, 'kill_process', `PID: ${pid}, Signal: ${signal}`);
        res.json({ message: '进程已终止' });
    } catch (error) {
        logActivity(req.user.username, 'kill_process_failed', `PID: ${pid}, Error: ${error.message}`);
        res.status(500).json({ error: '终止进程失败: ' + error.message });
    }
});

// 获取系统日志接口
app.get('/api/logs/system', authenticateToken, async (req, res) => {
    const { lines = 100, filter = '' } = req.query;
    
    try {
        let command = `journalctl -n ${lines} --no-pager`;
        if (filter) {
            command += ` | grep "${filter}"`;
        }
        
        const { stdout } = await execAsync(command);
        const logs = stdout.split('\n').filter(line => line.trim()).map(line => {
            const parts = line.split(' ');
            return {
                timestamp: parts.slice(0, 3).join(' '),
                source: parts[3] || '',
                message: parts.slice(4).join(' ')
            };
        });
        
        res.json({ logs });
    } catch (error) {
        res.status(500).json({ error: '获取系统日志失败: ' + error.message });
    }
});

// 获取应用日志接口
app.get('/api/logs/app', authenticateToken, async (req, res) => {
    try {
        let logs = [];
        if (fs.existsSync(LOGS_FILE)) {
            logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
        }
        res.json({ logs });
    } catch (error) {
        res.status(500).json({ error: '获取应用日志失败' });
    }
});

// 文件管理 - 列出目录内容
app.get('/api/files', authenticateToken, async (req, res) => {
    const { path: dirPath = '/tmp' } = req.query;
    
    try {
        // 安全检查 - 限制访问路径
        const allowedPaths = ['/tmp', '/var/log', '/home', '/opt/aquapanel'];
        const isAllowed = allowedPaths.some(allowed => dirPath.startsWith(allowed));
        
        if (!isAllowed) {
            return res.status(403).json({ error: '访问路径不被允许' });
        }
        
        const items = [];
        const files = fs.readdirSync(dirPath);
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = fs.statSync(filePath);
            
            items.push({
                name: file,
                path: filePath,
                isDirectory: stats.isDirectory(),
                size: stats.size,
                modified: stats.mtime,
                permissions: '0' + (stats.mode & parseInt('777', 8)).toString(8)
            });
        }
        
        res.json({ 
            currentPath: dirPath,
            items: items.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            })
        });
    } catch (error) {
        res.status(500).json({ error: '读取目录失败: ' + error.message });
    }
});

// 文件管理 - 读取文件内容
app.get('/api/files/content', authenticateToken, async (req, res) => {
    const { path: filePath } = req.query;
    
    try {
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            return res.status(400).json({ error: '不能读取目录内容' });
        }
        
        // 限制文件大小（最大1MB）
        if (stats.size > 1024 * 1024) {
            return res.status(400).json({ error: '文件过大，无法显示' });
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        res.json({ content, size: stats.size });
    } catch (error) {
        res.status(500).json({ error: '读取文件失败: ' + error.message });
    }
});

// 服务管理 - 获取服务列表
app.get('/api/services', authenticateToken, async (req, res) => {
    try {
        const { stdout } = await execAsync('systemctl list-units --type=service --state=running --no-pager');
        const services = stdout.split('\n')
            .filter(line => line.includes('.service'))
            .map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                    name: parts[0],
                    status: parts[2],
                    description: parts.slice(4).join(' ')
                };
            });
        
        res.json({ services });
    } catch (error) {
        res.status(500).json({ error: '获取服务列表失败: ' + error.message });
    }
});

// 服务管理 - 控制服务
app.post('/api/services/:serviceName/:action', authenticateToken, async (req, res) => {
    const { serviceName, action } = req.params;
    const allowedActions = ['start', 'stop', 'restart', 'reload'];
    
    if (!allowedActions.includes(action)) {
        return res.status(400).json({ error: '不支持的操作' });
    }
    
    try {
        await execAsync(`systemctl ${action} ${serviceName}`);
        logActivity(req.user.username, 'service_control', `${action} ${serviceName}`);
        res.json({ message: `服务 ${serviceName} ${action} 成功` });
    } catch (error) {
        logActivity(req.user.username, 'service_control_failed', `${action} ${serviceName}: ${error.message}`);
        res.status(500).json({ error: `服务操作失败: ${error.message}` });
    }
});

// 系统命令执行接口（谨慎使用）
app.post('/api/terminal', authenticateToken, async (req, res) => {
    const { command } = req.body;
    
    // 仅管理员可以执行终端命令
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '权限不足' });
    }
    
    // 危险命令黑名单
    const dangerousCommands = ['rm -rf', 'mkfs', 'dd if=', 'shutdown', 'reboot', 'init 0'];
    const isDangerous = dangerousCommands.some(cmd => command.includes(cmd));
    
    if (isDangerous) {
        logActivity(req.user.username, 'dangerous_command_blocked', command);
        return res.status(403).json({ error: '危险命令被阻止' });
    }
    
    try {
        const { stdout, stderr } = await execAsync(command, { timeout: 10000 });
        logActivity(req.user.username, 'terminal_command', command);
        res.json({ 
            output: stdout + (stderr ? '\nSTDERR:\n' + stderr : ''),
            success: true 
        });
    } catch (error) {
        logActivity(req.user.username, 'terminal_command_failed', `${command}: ${error.message}`);
        res.json({ 
            output: error.message,
            success: false 
        });
    }
});

// 网络监控 - 获取网络连接信息
app.get('/api/network/connections', authenticateToken, async (req, res) => {
    try {
        const { stdout } = await execAsync('netstat -tulpn');
        const connections = stdout.split('\n')
            .filter(line => line.trim() && !line.includes('Active') && !line.includes('Proto'))
            .map(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 6) {
                    return {
                        protocol: parts[0],
                        localAddress: parts[3],
                        foreignAddress: parts[4] || '-',
                        state: parts[5] || '-',
                        pid: parts[6] ? parts[6].split('/')[0] : '-',
                        program: parts[6] ? parts[6].split('/')[1] : '-'
                    };
                }
                return null;
            })
            .filter(conn => conn !== null);
        
        res.json({ connections });
    } catch (error) {
        res.status(500).json({ error: '获取网络连接失败: ' + error.message });
    }
});

// 网络监控 - 端口扫描
app.post('/api/network/scan', authenticateToken, async (req, res) => {
    const { host, ports } = req.body;
    
    if (!host || !ports) {
        return res.status(400).json({ error: '主机和端口参数必须提供' });
    }
    
    try {
        const portList = ports.split(',').map(p => p.trim());
        const results = [];
        
        for (const port of portList) {
            try {
                await execAsync(`timeout 3 bash -c "echo >/dev/tcp/${host}/${port}"`, { timeout: 5000 });
                results.push({ port, status: 'open' });
            } catch (error) {
                results.push({ port, status: 'closed' });
            }
        }
        
        logActivity(req.user.username, 'port_scan', `${host}:${ports}`);
        res.json({ host, results });
    } catch (error) {
        res.status(500).json({ error: '端口扫描失败: ' + error.message });
    }
});

// 网络监控 - 网络统计
app.get('/api/network/stats', authenticateToken, async (req, res) => {
    try {
        const networkStats = await si.networkStats();
        const networkInterfaces = await si.networkInterfaces();
        
        res.json({
            stats: networkStats.map(stat => ({
                interface: stat.iface,
                operstate: stat.operstate,
                rx_bytes: stat.rx_bytes,
                tx_bytes: stat.tx_bytes,
                rx_sec: stat.rx_sec,
                tx_sec: stat.tx_sec,
                rx_dropped: stat.rx_dropped,
                tx_dropped: stat.tx_dropped
            })),
            interfaces: networkInterfaces.filter(iface => !iface.internal).map(iface => ({
                name: iface.iface,
                ip4: iface.ip4,
                ip6: iface.ip6,
                mac: iface.mac,
                speed: iface.speed,
                operstate: iface.operstate
            }))
        });
    } catch (error) {
        res.status(500).json({ error: '获取网络统计失败: ' + error.message });
    }
});

// 软件包管理 - 获取已安装软件包
app.get('/api/packages', authenticateToken, async (req, res) => {
    const { page = 1, limit = 50, search = '' } = req.query;
    
    try {
        let command;
        
        // 检测包管理器
        if (await execAsync('which apt').then(() => true).catch(() => false)) {
            command = search ? 
                `dpkg -l | grep -i "${search}" | head -${limit}` :
                `dpkg -l | head -${parseInt(page) * parseInt(limit)}`;
        } else if (await execAsync('which yum').then(() => true).catch(() => false)) {
            command = search ?
                `yum list installed | grep -i "${search}" | head -${limit}` :
                `yum list installed | head -${parseInt(page) * parseInt(limit)}`;
        } else {
            return res.status(500).json({ error: '不支持的包管理器' });
        }
        
        const { stdout } = await execAsync(command);
        const packages = stdout.split('\n')
            .filter(line => line.trim() && !line.includes('Listing') && !line.includes('Desired'))
            .map(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 3) {
                    return {
                        name: parts[1],
                        version: parts[2],
                        status: parts[0],
                        description: parts.slice(3).join(' ')
                    };
                }
                return null;
            })
            .filter(pkg => pkg !== null);
            
        res.json({ packages, total: packages.length });
    } catch (error) {
        res.status(500).json({ error: '获取软件包列表失败: ' + error.message });
    }
});

// 软件包管理 - 安装软件包
app.post('/api/packages/install', authenticateToken, async (req, res) => {
    const { packageName } = req.body;
    
    if (!packageName) {
        return res.status(400).json({ error: '软件包名称不能为空' });
    }
    
    // 仅管理员可以安装软件包
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '权限不足' });
    }
    
    try {
        let command;
        
        if (await execAsync('which apt').then(() => true).catch(() => false)) {
            command = `apt-get update && apt-get install -y ${packageName}`;
        } else if (await execAsync('which yum').then(() => true).catch(() => false)) {
            command = `yum install -y ${packageName}`;
        } else {
            return res.status(500).json({ error: '不支持的包管理器' });
        }
        
        const { stdout, stderr } = await execAsync(command, { timeout: 300000 }); // 5分钟超时
        
        logActivity(req.user.username, 'package_install', packageName);
        res.json({ 
            message: `软件包 ${packageName} 安装成功`,
            output: stdout + (stderr ? '\nSTDERR:\n' + stderr : '')
        });
    } catch (error) {
        logActivity(req.user.username, 'package_install_failed', `${packageName}: ${error.message}`);
        res.status(500).json({ error: '软件包安装失败: ' + error.message });
    }
});

// 软件包管理 - 卸载软件包
app.post('/api/packages/remove', authenticateToken, async (req, res) => {
    const { packageName } = req.body;
    
    if (!packageName) {
        return res.status(400).json({ error: '软件包名称不能为空' });
    }
    
    // 仅管理员可以卸载软件包
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '权限不足' });
    }
    
    try {
        let command;
        
        if (await execAsync('which apt').then(() => true).catch(() => false)) {
            command = `apt-get remove -y ${packageName}`;
        } else if (await execAsync('which yum').then(() => true).catch(() => false)) {
            command = `yum remove -y ${packageName}`;
        } else {
            return res.status(500).json({ error: '不支持的包管理器' });
        }
        
        const { stdout, stderr } = await execAsync(command, { timeout: 300000 });
        
        logActivity(req.user.username, 'package_remove', packageName);
        res.json({ 
            message: `软件包 ${packageName} 卸载成功`,
            output: stdout + (stderr ? '\nSTDERR:\n' + stderr : '')
        });
    } catch (error) {
        logActivity(req.user.username, 'package_remove_failed', `${packageName}: ${error.message}`);
        res.status(500).json({ error: '软件包卸载失败: ' + error.message });
    }
});

// 定时任务管理 - 获取crontab列表
app.get('/api/crontab', authenticateToken, async (req, res) => {
    try {
        const { stdout } = await execAsync('crontab -l');
        const crontabs = stdout.split('\n')
            .filter(line => line.trim() && !line.startsWith('#'))
            .map((line, index) => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 6) {
                    return {
                        id: index,
                        minute: parts[0],
                        hour: parts[1],
                        day: parts[2],
                        month: parts[3],
                        weekday: parts[4],
                        command: parts.slice(5).join(' '),
                        schedule: `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]}`,
                        full: line.trim()
                    };
                }
                return null;
            })
            .filter(cron => cron !== null);
            
        res.json({ crontabs });
    } catch (error) {
        // 如果没有crontab，返回空数组
        if (error.message.includes('no crontab')) {
            res.json({ crontabs: [] });
        } else {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    }
});

// 定时任务管理 - 添加定时任务
app.post('/api/crontab', authenticateToken, async (req, res) => {
    const { minute, hour, day, month, weekday, command, description } = req.body;
    
    if (!command) {
        return res.status(400).json({ error: '命令不能为空' });
    }
    
    // 仅管理员可以管理定时任务
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '权限不足' });
    }
    
    try {
        // 构建cron表达式
        const cronExpression = `${minute || '*'} ${hour || '*'} ${day || '*'} ${month || '*'} ${weekday || '*'}`;
        const cronLine = `${cronExpression} ${command}`;
        
        // 获取现有的crontab
        let existingCrontab = '';
        try {
            const { stdout } = await execAsync('crontab -l');
            existingCrontab = stdout;
        } catch (error) {
            // 如果没有现有的crontab，忽略错误
        }
        
        // 添加新的cron任务
        const newCrontab = existingCrontab + (existingCrontab ? '\n' : '') + cronLine + '\n';
        
        // 写入临时文件
        const tempFile = '/tmp/crontab_temp';
        fs.writeFileSync(tempFile, newCrontab);
        
        // 安装新的crontab
        await execAsync(`crontab ${tempFile}`);
        
        // 删除临时文件
        fs.unlinkSync(tempFile);
        
        logActivity(req.user.username, 'crontab_add', cronLine);
        res.json({ message: '定时任务添加成功' });
    } catch (error) {
        logActivity(req.user.username, 'crontab_add_failed', `${command}: ${error.message}`);
        res.status(500).json({ error: '添加定时任务失败: ' + error.message });
    }
});

// 定时任务管理 - 删除定时任务
app.delete('/api/crontab/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    
    // 仅管理员可以管理定时任务
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '权限不足' });
    }
    
    try {
        // 获取现有的crontab
        const { stdout } = await execAsync('crontab -l');
        const crontabLines = stdout.split('\n').filter(line => line.trim());
        
        // 删除指定行
        const filteredLines = crontabLines.filter((line, index) => index !== parseInt(id) && !line.startsWith('#'));
        
        // 写入临时文件
        const tempFile = '/tmp/crontab_temp';
        fs.writeFileSync(tempFile, filteredLines.join('\n') + '\n');
        
        // 安装新的crontab
        await execAsync(`crontab ${tempFile}`);
        
        // 删除临时文件
        fs.unlinkSync(tempFile);
        
        logActivity(req.user.username, 'crontab_remove', `ID: ${id}`);
        res.json({ message: '定时任务删除成功' });
    } catch (error) {
        logActivity(req.user.username, 'crontab_remove_failed', `ID: ${id}, Error: ${error.message}`);
        res.status(500).json({ error: '删除定时任务失败: ' + error.message });
    }
});

// 系统监控告警 - 获取告警配置
app.get('/api/alerts/config', authenticateToken, async (req, res) => {
    try {
        const configFile = path.join(__dirname, 'data', 'alerts.json');
        let alertConfig = {
            cpu: { enabled: false, threshold: 80 },
            memory: { enabled: false, threshold: 85 },
            disk: { enabled: false, threshold: 90 },
            notifications: {
                email: { enabled: false, recipients: [] },
                webhook: { enabled: false, url: '' }
            }
        };
        
        if (fs.existsSync(configFile)) {
            alertConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        }
        
        res.json(alertConfig);
    } catch (error) {
        res.status(500).json({ error: '获取告警配置失败: ' + error.message });
    }
});

// 系统监控告警 - 更新告警配置
app.put('/api/alerts/config', authenticateToken, async (req, res) => {
    // 仅管理员可以配置告警
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '权限不足' });
    }
    
    try {
        const configFile = path.join(__dirname, 'data', 'alerts.json');
        fs.writeFileSync(configFile, JSON.stringify(req.body, null, 2));
        
        logActivity(req.user.username, 'alert_config_update', '告警配置已更新');
        res.json({ message: '告警配置更新成功' });
    } catch (error) {
        res.status(500).json({ error: '更新告警配置失败: ' + error.message });
    }
});

// 系统监控告警 - 获取告警历史
app.get('/api/alerts/history', authenticateToken, async (req, res) => {
    try {
        const alertHistoryFile = path.join(__dirname, 'data', 'alert_history.json');
        let alertHistory = [];
        
        if (fs.existsSync(alertHistoryFile)) {
            alertHistory = JSON.parse(fs.readFileSync(alertHistoryFile, 'utf8'));
        }
        
        // 返回最近100条告警记录
        res.json({ alerts: alertHistory.slice(0, 100) });
    } catch (error) {
        res.status(500).json({ error: '获取告警历史失败: ' + error.message });
    }
});

// WebSocket连接处理
wss.on('connection', (ws) => {
    console.log('WebSocket连接建立');
    
    // 发送实时性能数据
    const performanceInterval = setInterval(async () => {
        const data = await getPerformanceData();
        if (data && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'performance', data }));
        }
    }, 2000);
    
    // 发送实时进程数据
    const processInterval = setInterval(async () => {
        const processes = await getProcessList();
        if (processes && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'processes', data: processes.slice(0, 20) }));
        }
    }, 5000);
    
    ws.on('close', () => {
        console.log('WebSocket连接关闭');
        clearInterval(performanceInterval);
        clearInterval(processInterval);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
        clearInterval(performanceInterval);
        clearInterval(processInterval);
    });
});

// 定期更新系统信息
cron.schedule('*/10 * * * *', async () => {
    systemInfo = await getSystemInfo();
    console.log('系统信息已更新');
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`AquaPanel服务器运行在端口 ${PORT}`);
    console.log(`访问地址: http://localhost:${PORT}`);
});