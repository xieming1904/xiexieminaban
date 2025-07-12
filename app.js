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
const fs = require('fs').promises;
const fsSync = require('fs');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const helmet = require('helmet');

// 引入自定义模块
const DatabaseManager = require('./lib/database');
const AlertSystem = require('./lib/alerts');
const UserManager = require('./lib/users');
const PluginManager = require('./lib/plugins');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 配置常量
const CONFIG = {
    JWT_SECRET: process.env.JWT_SECRET || 'aqua-panel-secret-key-2024',
    PORT: process.env.PORT || 3000,
    WS_UPDATE_INTERVAL: 2000,
    SYSTEM_INFO_UPDATE_INTERVAL: 10 * 60 * 1000, // 10分钟
    PERFORMANCE_CACHE_TTL: 1000, // 1秒缓存
    MAX_LOGIN_ATTEMPTS: 5,
    LOGIN_LOCKOUT_TIME: 15 * 60 * 1000, // 15分钟
    DATA_DIR: path.join(__dirname, 'data'),
    USERS_FILE: path.join(__dirname, 'data', 'users.json'),
    LOGS_FILE: path.join(__dirname, 'data', 'logs.json'),
    DATABASE_FILE: path.join(__dirname, 'data', 'aquapanel.db'),
    ALERTS_CONFIG_FILE: path.join(__dirname, 'data', 'alerts.json'),
    PLUGINS_DIR: path.join(__dirname, 'plugins'),
    NOTIFICATION_EMAIL: process.env.NOTIFICATION_EMAIL || '',
    SMTP_CONFIG: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || ''
        }
    },
    ALERT_THRESHOLDS: {
        cpu: 80,
        memory: 85,
        disk: 90,
        temperature: 75
    }
};

// 中间件配置优化
app.use(helmet({
    contentSecurityPolicy: false // 允许内联脚本和样式
}));
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public', {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true
}));

// 内存缓存系统
class MemoryCache {
    constructor() {
        this.cache = new Map();
    }
    
    set(key, value, ttl = 60000) {
        const expiry = Date.now() + ttl;
        this.cache.set(key, { value, expiry });
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }
    
    clear() {
        this.cache.clear();
    }
    
    // 定期清理过期缓存
    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiry) {
                this.cache.delete(key);
            }
        }
    }
}

const cache = new MemoryCache();

// 登录失败追踪
const loginAttempts = new Map();

// 系统信息缓存
let systemInfo = {};
let users = {};

// 模块实例
let database;
let alertSystem;
let userManager;
let pluginManager;

// 错误日志记录
async function logError(error, context = '') {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        context,
        error: error.message,
        stack: error.stack
    };
    
    try {
        let logs = [];
        if (fsSync.existsSync(CONFIG.LOGS_FILE)) {
            const logData = await fs.readFile(CONFIG.LOGS_FILE, 'utf8');
            logs = JSON.parse(logData);
        }
        
        logs.push(logEntry);
        
        // 保持最新的1000条日志
        if (logs.length > 1000) {
            logs = logs.slice(-1000);
        }
        
        await fs.writeFile(CONFIG.LOGS_FILE, JSON.stringify(logs, null, 2));
    } catch (writeError) {
        console.error('写入日志失败:', writeError);
    }
    
    console.error(`[${timestamp}] ${context}:`, error);
}

// 初始化数据和模块
async function initializeData() {
    try {
        if (!fsSync.existsSync(CONFIG.DATA_DIR)) {
            await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        }

        // 初始化数据库
        database = new DatabaseManager(CONFIG.DATABASE_FILE);
        await database.initialize();
        
        // 初始化告警系统
        alertSystem = new AlertSystem(database, CONFIG);
        
        // 初始化用户管理
        userManager = new UserManager(database, CONFIG);
        
        // 初始化插件系统
        pluginManager = new PluginManager(database, CONFIG);
        
        // 创建默认管理员用户（如果数据库中不存在）
        const adminUser = await database.getUser('admin');
        if (!adminUser) {
            await userManager.createUser({
                username: 'admin',
                password: 'admin123',
                email: 'admin@aquapanel.local',
                role: 'admin'
            });
            console.log('默认管理员用户已创建: admin/admin123');
        }
        
        // 加载插件
        await pluginManager.loadAllPlugins();

        console.log('数据库和模块初始化完成');
    } catch (error) {
        await logError(error, '初始化数据');
        process.exit(1);
    }
}

// 优化的系统信息获取函数
async function getSystemInfo() {
    const cacheKey = 'systemInfo';
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    
    try {
        const [cpu, mem, disk, network, os, graphics] = await Promise.all([
            si.cpu(),
            si.mem(),
            si.fsSize(),
            si.networkInterfaces(),
            si.osInfo(),
            si.graphics().catch(() => null) // 显卡信息可能不可用
        ]);
        
        const info = {
            cpu: {
                manufacturer: cpu.manufacturer,
                brand: cpu.brand,
                model: cpu.model,
                cores: cpu.cores,
                physicalCores: cpu.physicalCores,
                speed: cpu.speed,
                speedMax: cpu.speedMax,
                cache: cpu.cache
            },
            memory: {
                total: mem.total,
                used: mem.used,
                free: mem.free,
                available: mem.available,
                usage: ((mem.used / mem.total) * 100).toFixed(2)
            },
            disk: disk.filter(d => d.size > 0).map(d => ({
                filesystem: d.fs,
                type: d.type,
                mount: d.mount,
                size: d.size,
                used: d.used,
                available: d.available,
                usage: d.use
            })),
            network: network.filter(n => !n.internal && n.ip4).map(n => ({
                interface: n.iface,
                ip4: n.ip4,
                ip6: n.ip6,
                mac: n.mac,
                speed: n.speed,
                type: n.type
            })),
            os: {
                platform: os.platform,
                distro: os.distro,
                release: os.release,
                codename: os.codename,
                kernel: os.kernel,
                arch: os.arch,
                hostname: os.hostname,
                uptime: os.uptime,
                logofile: os.logofile
            },
            graphics: graphics ? graphics.controllers.map(g => ({
                vendor: g.vendor,
                model: g.model,
                vram: g.vram,
                vramDynamic: g.vramDynamic
            })) : []
        };
        
        cache.set(cacheKey, info, CONFIG.SYSTEM_INFO_UPDATE_INTERVAL);
        return info;
    } catch (error) {
        await logError(error, '获取系统信息');
        return null;
    }
}

// 优化的性能数据获取函数
async function getPerformanceData() {
    const cacheKey = 'performanceData';
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    
    try {
        const [cpuLoad, mem, networkStats, fsStats, processes, services] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.networkStats().catch(() => []),
            si.disksIO().catch(() => null),
            si.processes().catch(() => ({ list: [] })),
            si.services('*').catch(() => [])
        ]);
        
        const data = {
            cpu: {
                usage: Number(cpuLoad.currentLoad.toFixed(2)),
                user: Number(cpuLoad.currentLoadUser.toFixed(2)),
                system: Number(cpuLoad.currentLoadSystem.toFixed(2)),
                nice: Number(cpuLoad.currentLoadNice.toFixed(2)),
                idle: Number(cpuLoad.currentLoadIdle.toFixed(2)),
                irq: Number(cpuLoad.currentLoadIrq.toFixed(2)),
                cores: cpuLoad.cpus.map(core => ({
                    load: Number(core.load.toFixed(2)),
                    loadUser: Number(core.loadUser.toFixed(2)),
                    loadSystem: Number(core.loadSystem.toFixed(2))
                }))
            },
            memory: {
                total: mem.total,
                used: mem.used,
                free: mem.free,
                available: mem.available,
                buffers: mem.buffers,
                cached: mem.cached,
                usage: Number(((mem.used / mem.total) * 100).toFixed(2)),
                swap: {
                    total: mem.swaptotal,
                    used: mem.swapused,
                    free: mem.swapfree
                }
            },
            network: networkStats.filter(n => n.iface && !n.iface.includes('lo')).map(n => ({
                interface: n.iface,
                rx_bytes: n.rx_bytes,
                tx_bytes: n.tx_bytes,
                rx_sec: n.rx_sec,
                tx_sec: n.tx_sec,
                rx_dropped: n.rx_dropped,
                tx_dropped: n.tx_dropped,
                rx_errors: n.rx_errors,
                tx_errors: n.tx_errors
            })),
            disk: fsStats ? {
                reads: fsStats.rIO,
                writes: fsStats.wIO,
                readBytes: fsStats.rIO_sec,
                writeBytes: fsStats.wIO_sec,
                readTime: fsStats.tIO,
                writeTime: fsStats.tIO_sec
            } : null,
            processes: {
                all: processes.all,
                running: processes.running,
                blocked: processes.blocked,
                sleeping: processes.sleeping,
                unknown: processes.unknown,
                list: processes.list.slice(0, 10).map(p => ({
                    pid: p.pid,
                    ppid: p.ppid,
                    name: p.name,
                    command: p.command,
                    cpu: p.cpu,
                    mem: p.mem,
                    state: p.state
                }))
            },
            services: services.slice(0, 20).map(s => ({
                name: s.name,
                running: s.running,
                startmode: s.startmode,
                pids: s.pids
            })),
            timestamp: new Date().toISOString()
        };
        
        cache.set(cacheKey, data, CONFIG.PERFORMANCE_CACHE_TTL);
        return data;
    } catch (error) {
        await logError(error, '获取性能数据');
        return null;
    }
}

// 增强的身份验证中间件
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            error: '访问令牌未提供',
            code: 'TOKEN_MISSING'
        });
    }
    
    jwt.verify(token, CONFIG.JWT_SECRET, (err, user) => {
        if (err) {
            let errorCode = 'TOKEN_INVALID';
            let message = '令牌无效';
            
            if (err.name === 'TokenExpiredError') {
                errorCode = 'TOKEN_EXPIRED';
                message = '令牌已过期';
            } else if (err.name === 'JsonWebTokenError') {
                errorCode = 'TOKEN_MALFORMED';
                message = '令牌格式错误';
            }
            
            return res.status(403).json({ 
                error: message,
                code: errorCode
            });
        }
        
        req.user = user;
        next();
    });
}

// 检查登录失败限制
function checkLoginAttempts(username) {
    const attempts = loginAttempts.get(username);
    if (!attempts) return true;
    
    if (attempts.count >= CONFIG.MAX_LOGIN_ATTEMPTS) {
        if (Date.now() < attempts.lockedUntil) {
            return false;
        } else {
            // 锁定时间已过，重置计数
            loginAttempts.delete(username);
            return true;
        }
    }
    
    return true;
}

// 记录登录失败
function recordLoginFailure(username) {
    const attempts = loginAttempts.get(username) || { count: 0, lockedUntil: 0 };
    attempts.count += 1;
    
    if (attempts.count >= CONFIG.MAX_LOGIN_ATTEMPTS) {
        attempts.lockedUntil = Date.now() + CONFIG.LOGIN_LOCKOUT_TIME;
    }
    
    loginAttempts.set(username, attempts);
}

// 路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 增强的登录接口
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');
        
        const result = await userManager.loginUser(username, password, ipAddress, userAgent);
        
        // 触发插件钩子
        await pluginManager.callHook('user_login', { username, ipAddress, userAgent });
        
        res.json(result);
    } catch (error) {
        await database.logMessage('error', '登录失败: ' + error.message, 'authentication');
        res.status(400).json({ 
            error: error.message,
            code: 'LOGIN_FAILED'
        });
    }
});

// 获取系统信息接口
app.get('/api/system-info', authenticateToken, async (req, res) => {
    try {
        const info = await getSystemInfo();
        if (info) {
            res.json(info);
        } else {
            res.status(500).json({ 
                error: '获取系统信息失败',
                code: 'SYSTEM_INFO_ERROR'
            });
        }
    } catch (error) {
        await logError(error, '获取系统信息接口');
        res.status(500).json({ 
            error: '服务器内部错误',
            code: 'INTERNAL_ERROR'
        });
    }
});

// 获取性能数据接口
app.get('/api/performance', authenticateToken, async (req, res) => {
    try {
        const data = await getPerformanceData();
        if (data) {
            res.json(data);
        } else {
            res.status(500).json({ 
                error: '获取性能数据失败',
                code: 'PERFORMANCE_DATA_ERROR'
            });
        }
    } catch (error) {
        await logError(error, '获取性能数据接口');
        res.status(500).json({ 
            error: '服务器内部错误',
            code: 'INTERNAL_ERROR'
        });
    }
});

// 获取系统日志接口
app.get('/api/logs', authenticateToken, async (req, res) => {
    try {
        const { limit = 100, offset = 0, level } = req.query;
        const logs = await database.getLogs(parseInt(limit), parseInt(offset), level);
        res.json(logs);
    } catch (error) {
        await database.logMessage('error', '获取日志失败: ' + error.message, 'api');
        res.status(500).json({ 
            error: '获取日志失败',
            code: 'LOGS_ERROR'
        });
    }
});

// 用户管理API
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        if (!userManager.hasPermission(req.user.role, 'admin')) {
            return res.status(403).json({ error: '权限不足' });
        }
        
        const { page = 1, limit = 20, role } = req.query;
        const result = await userManager.getUserList(parseInt(page), parseInt(limit), role);
        res.json(result);
    } catch (error) {
        await database.logMessage('error', '获取用户列表失败: ' + error.message, 'api');
        res.status(500).json({ error: '获取用户列表失败' });
    }
});

app.post('/api/users', authenticateToken, async (req, res) => {
    try {
        if (!userManager.hasPermission(req.user.role, 'admin')) {
            return res.status(403).json({ error: '权限不足' });
        }
        
        const result = await userManager.createUser(req.body, req.user.role);
        res.json(result);
    } catch (error) {
        await database.logMessage('error', '创建用户失败: ' + error.message, 'api');
        res.status(400).json({ error: error.message });
    }
});

// 告警管理API
app.get('/api/alerts/rules', authenticateToken, async (req, res) => {
    try {
        const rules = await alertSystem.getRules();
        res.json(rules);
    } catch (error) {
        await database.logMessage('error', '获取告警规则失败: ' + error.message, 'api');
        res.status(500).json({ error: '获取告警规则失败' });
    }
});

app.post('/api/alerts/rules', authenticateToken, async (req, res) => {
    try {
        if (!userManager.hasPermission(req.user.role, 'admin')) {
            return res.status(403).json({ error: '权限不足' });
        }
        
        const result = await alertSystem.createRule(req.body, req.user.userId);
        res.json(result);
    } catch (error) {
        await database.logMessage('error', '创建告警规则失败: ' + error.message, 'api');
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/alerts/history', authenticateToken, async (req, res) => {
    try {
        const { limit = 50, ruleId } = req.query;
        const history = await alertSystem.getAlertHistory(parseInt(limit), ruleId);
        res.json(history);
    } catch (error) {
        await database.logMessage('error', '获取告警历史失败: ' + error.message, 'api');
        res.status(500).json({ error: '获取告警历史失败' });
    }
});

// 插件管理API
app.get('/api/plugins', authenticateToken, async (req, res) => {
    try {
        if (!userManager.hasPermission(req.user.role, 'admin')) {
            return res.status(403).json({ error: '权限不足' });
        }
        
        const plugins = pluginManager.getPluginList();
        res.json(plugins);
    } catch (error) {
        await database.logMessage('error', '获取插件列表失败: ' + error.message, 'api');
        res.status(500).json({ error: '获取插件列表失败' });
    }
});

app.post('/api/plugins/:name/enable', authenticateToken, async (req, res) => {
    try {
        if (!userManager.hasPermission(req.user.role, 'admin')) {
            return res.status(403).json({ error: '权限不足' });
        }
        
        const result = await pluginManager.enablePlugin(req.params.name);
        res.json(result);
    } catch (error) {
        await database.logMessage('error', '启用插件失败: ' + error.message, 'api');
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/plugins/:name/disable', authenticateToken, async (req, res) => {
    try {
        if (!userManager.hasPermission(req.user.role, 'admin')) {
            return res.status(403).json({ error: '权限不足' });
        }
        
        const result = await pluginManager.disablePlugin(req.params.name);
        res.json(result);
    } catch (error) {
        await database.logMessage('error', '禁用插件失败: ' + error.message, 'api');
        res.status(400).json({ error: error.message });
    }
});

// 性能历史数据API
app.get('/api/performance/history', authenticateToken, async (req, res) => {
    try {
        const { hours = 24 } = req.query;
        const history = await database.getPerformanceHistory(parseInt(hours));
        res.json(history);
    } catch (error) {
        await database.logMessage('error', '获取性能历史失败: ' + error.message, 'api');
        res.status(500).json({ error: '获取性能历史失败' });
    }
});

// 系统统计API
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const [userStats, alertStats, pluginStats] = await Promise.all([
            userManager.getUserStats(),
            alertSystem.getAlertStats(),
            Promise.resolve(pluginManager.getStats())
        ]);
        
        res.json({
            users: userStats,
            alerts: alertStats,
            plugins: pluginStats,
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: '1.2.0-enterprise'
            }
        });
    } catch (error) {
        await database.logMessage('error', '获取统计数据失败: ' + error.message, 'api');
        res.status(500).json({ error: '获取统计数据失败' });
    }
});

// WebSocket连接管理
const wsClients = new Set();

wss.on('connection', (ws, req) => {
    console.log('WebSocket连接建立');
    wsClients.add(ws);
    
    let performanceInterval;
    
    // 发送实时性能数据
    const startPerformanceStream = async () => {
        performanceInterval = setInterval(async () => {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    const data = await getPerformanceData();
                    if (data) {
                        // 发送性能数据
                        ws.send(JSON.stringify({ type: 'performance', data }));
                        
                        // 触发插件钩子
                        await pluginManager.callHook('performance_data', data);
                        
                        // 检查告警
                        await alertSystem.checkAlerts(data);
                        
                        // 记录性能历史（每分钟记录一次）
                        if (Date.now() % 60000 < CONFIG.WS_UPDATE_INTERVAL) {
                            await database.recordPerformance({
                                cpu_usage: data.cpu?.usage,
                                memory_usage: data.memory?.usage,
                                disk_usage: data.disk?.usage || 0,
                                network_in: data.network?.[0]?.rx_sec || 0,
                                network_out: data.network?.[0]?.tx_sec || 0,
                                temperature: null,
                                load_average: data.cpu?.cores?.reduce((sum, core) => sum + core.load, 0) / (data.cpu?.cores?.length || 1)
                            });
                        }
                    }
                } catch (error) {
                    await database.logMessage('error', 'WebSocket性能数据发送失败: ' + error.message, 'websocket');
                }
            } else {
                clearInterval(performanceInterval);
            }
        }, CONFIG.WS_UPDATE_INTERVAL);
    };
    
    // 处理消息
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            switch (data.type) {
                case 'start_monitoring':
                    startPerformanceStream();
                    break;
                case 'stop_monitoring':
                    if (performanceInterval) {
                        clearInterval(performanceInterval);
                    }
                    break;
                default:
                    console.log('未知消息类型:', data.type);
            }
        } catch (error) {
            console.error('WebSocket消息处理错误:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('WebSocket连接关闭');
        wsClients.delete(ws);
        if (performanceInterval) {
            clearInterval(performanceInterval);
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
        wsClients.delete(ws);
        if (performanceInterval) {
            clearInterval(performanceInterval);
        }
    });
});

// 定期任务优化
cron.schedule('*/10 * * * *', async () => {
    try {
        systemInfo = await getSystemInfo();
        console.log('系统信息已更新');
    } catch (error) {
        await database.logMessage('error', '定期更新系统信息失败: ' + error.message, 'system');
    }
});

// 缓存清理任务
cron.schedule('*/5 * * * *', async () => {
    try {
        cache.cleanup();
        alertSystem.cleanupActiveAlerts();
        await userManager.cleanupExpiredSessions();
        console.log('缓存清理完成');
    } catch (error) {
        await database.logMessage('error', '缓存清理失败: ' + error.message, 'system');
    }
});

// 数据清理任务（每天凌晨2点）
cron.schedule('0 2 * * *', async () => {
    try {
        const retentionDays = await database.getConfig('data_retention_days') || 30;
        await database.cleanupOldData(parseInt(retentionDays));
        console.log('数据清理完成');
    } catch (error) {
        await database.logMessage('error', '数据清理失败: ' + error.message, 'system');
    }
});

// 优雅关闭处理
async function gracefulShutdown(signal) {
    console.log(`收到${signal}信号，正在优雅关闭...`);
    
    try {
        // 关闭HTTP服务器
        server.close(async () => {
            console.log('HTTP服务器已关闭');
            
            // 关闭数据库连接
            if (database) {
                await database.close();
            }
            
            // 卸载所有插件
            if (pluginManager) {
                for (const [name] of pluginManager.plugins.entries()) {
                    try {
                        await pluginManager.unloadPlugin(name);
                    } catch (error) {
                        console.error(`卸载插件失败 [${name}]:`, error);
                    }
                }
            }
            
            console.log('所有资源已释放');
            process.exit(0);
        });
    } catch (error) {
        console.error('优雅关闭失败:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 全局错误处理
process.on('uncaughtException', async (error) => {
    if (database) {
        await database.logMessage('error', '未捕获的异常: ' + error.message, 'system', null, null, null, error.stack);
    }
    console.error('未捕获的异常，服务器将退出');
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    if (database) {
        await database.logMessage('error', '未处理的Promise拒绝: ' + reason, 'system');
    }
    console.error('未处理的Promise拒绝:', reason);
});

// 启动服务器
async function startServer() {
    try {
        await initializeData();
        
        server.listen(CONFIG.PORT, () => {
            console.log(`🌊 AquaPanel v1.2.0-enterprise 服务器运行在端口 ${CONFIG.PORT}`);
            console.log(`🌐 访问地址: http://localhost:${CONFIG.PORT}`);
            console.log('🚀 企业级功能已启用:');
            console.log('  ✅ SQLite数据库集成');
            console.log('  ✅ 智能告警系统');
            console.log('  ✅ 多用户权限管理');
            console.log('  ✅ 插件系统架构');
            console.log('  ✅ 邮件通知支持');
            console.log('  ✅ 性能历史记录');
            console.log('  ✅ 内存缓存优化');
            console.log('  ✅ 增强安全防护');
            console.log('  ✅ 优雅关闭处理');
            console.log('  ✅ RESTful API');
            console.log('📊 默认管理员: admin/admin123');
        });
    } catch (error) {
        console.error('服务器启动失败:', error);
        if (database) {
            await database.logMessage('error', '服务器启动失败: ' + error.message, 'system');
        }
        process.exit(1);
    }
}

startServer();