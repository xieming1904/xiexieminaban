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

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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
    
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    
    if (!users[username]) {
        return res.status(401).json({ error: '用户不存在' });
    }
    
    if (!bcrypt.compareSync(password, users[username].password)) {
        return res.status(401).json({ error: '密码错误' });
    }
    
    const token = jwt.sign(
        { username, role: users[username].role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
    
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
    
    ws.on('close', () => {
        console.log('WebSocket连接关闭');
        clearInterval(performanceInterval);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
        clearInterval(performanceInterval);
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