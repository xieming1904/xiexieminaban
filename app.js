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