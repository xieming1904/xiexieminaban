/**
 * AquaPanel v1.2.0 数据库管理模块
 * SQLite数据库集成，用于存储用户、日志、告警等数据
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

class DatabaseManager {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
    }
    
    /**
     * 初始化数据库连接
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('SQLite数据库连接成功');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }
    
    /**
     * 创建数据表
     */
    async createTables() {
        const tables = [
            // 用户表
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                email TEXT,
                role TEXT DEFAULT 'user',
                avatar TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME,
                login_attempts INTEGER DEFAULT 0,
                locked_until DATETIME,
                is_active BOOLEAN DEFAULT 1,
                preferences TEXT DEFAULT '{}'
            )`,
            
            // 系统日志表
            `CREATE TABLE IF NOT EXISTS system_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                context TEXT,
                user_id INTEGER,
                ip_address TEXT,
                user_agent TEXT,
                stack_trace TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,
            
            // 告警规则表
            `CREATE TABLE IF NOT EXISTS alert_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                metric TEXT NOT NULL,
                operator TEXT NOT NULL,
                threshold REAL NOT NULL,
                severity TEXT DEFAULT 'warning',
                enabled BOOLEAN DEFAULT 1,
                notification_channels TEXT DEFAULT '[]',
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users (id)
            )`,
            
            // 告警历史表
            `CREATE TABLE IF NOT EXISTS alert_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER NOT NULL,
                triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                resolved_at DATETIME,
                value REAL NOT NULL,
                status TEXT DEFAULT 'triggered',
                message TEXT,
                acknowledged_by INTEGER,
                acknowledged_at DATETIME,
                FOREIGN KEY (rule_id) REFERENCES alert_rules (id),
                FOREIGN KEY (acknowledged_by) REFERENCES users (id)
            )`,
            
            // 性能数据历史表
            `CREATE TABLE IF NOT EXISTS performance_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                cpu_usage REAL,
                memory_usage REAL,
                disk_usage REAL,
                network_in REAL,
                network_out REAL,
                temperature REAL,
                load_average REAL
            )`,
            
            // 用户会话表
            `CREATE TABLE IF NOT EXISTS user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_token TEXT UNIQUE NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,
            
            // 系统配置表
            `CREATE TABLE IF NOT EXISTS system_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT,
                description TEXT,
                category TEXT DEFAULT 'general',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 插件表
            `CREATE TABLE IF NOT EXISTS plugins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                version TEXT NOT NULL,
                description TEXT,
                author TEXT,
                enabled BOOLEAN DEFAULT 0,
                config TEXT DEFAULT '{}',
                installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];
        
        for (const sql of tables) {
            await this.run(sql);
        }
        
        // 插入默认配置
        await this.insertDefaultConfig();
        console.log('数据库表创建完成');
    }
    
    /**
     * 插入默认配置
     */
    async insertDefaultConfig() {
        const defaultConfigs = [
            { key: 'app_name', value: 'AquaPanel', description: '应用名称', category: 'general' },
            { key: 'app_version', value: '1.2.0-enterprise', description: '应用版本', category: 'general' },
            { key: 'theme', value: 'liquid-glass', description: '界面主题', category: 'appearance' },
            { key: 'auto_refresh_interval', value: '2000', description: '自动刷新间隔(毫秒)', category: 'performance' },
            { key: 'data_retention_days', value: '30', description: '数据保留天数', category: 'storage' },
            { key: 'enable_email_alerts', value: 'false', description: '启用邮件告警', category: 'alerts' },
            { key: 'max_login_attempts', value: '5', description: '最大登录尝试次数', category: 'security' },
            { key: 'session_timeout', value: '86400', description: '会话超时时间(秒)', category: 'security' }
        ];
        
        for (const config of defaultConfigs) {
            await this.run(
                'INSERT OR IGNORE INTO system_config (key, value, description, category) VALUES (?, ?, ?, ?)',
                [config.key, config.value, config.description, config.category]
            );
        }
    }
    
    /**
     * 执行SQL查询（返回单行）
     */
    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
    
    /**
     * 执行SQL查询（返回多行）
     */
    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
    
    /**
     * 执行SQL命令（INSERT/UPDATE/DELETE）
     */
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }
    
    /**
     * 创建用户
     */
    async createUser(userData) {
        const sql = `
            INSERT INTO users (username, password, email, role, avatar, preferences)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        return await this.run(sql, [
            userData.username,
            userData.password,
            userData.email || null,
            userData.role || 'user',
            userData.avatar || null,
            JSON.stringify(userData.preferences || {})
        ]);
    }
    
    /**
     * 获取用户
     */
    async getUser(username) {
        const sql = 'SELECT * FROM users WHERE username = ? AND is_active = 1';
        const user = await this.get(sql, [username]);
        if (user && user.preferences) {
            user.preferences = JSON.parse(user.preferences);
        }
        return user;
    }
    
    /**
     * 获取所有用户
     */
    async getAllUsers() {
        const sql = 'SELECT id, username, email, role, avatar, created_at, last_login, is_active FROM users';
        return await this.all(sql);
    }
    
    /**
     * 更新用户
     */
    async updateUser(username, updates) {
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (key === 'preferences') {
                fields.push(`${key} = ?`);
                values.push(JSON.stringify(value));
            } else {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        
        values.push(username);
        const sql = `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE username = ?`;
        return await this.run(sql, values);
    }
    
    /**
     * 记录系统日志
     */
    async logMessage(level, message, context = null, userId = null, ipAddress = null, userAgent = null, stackTrace = null) {
        const sql = `
            INSERT INTO system_logs (level, message, context, user_id, ip_address, user_agent, stack_trace)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        return await this.run(sql, [level, message, context, userId, ipAddress, userAgent, stackTrace]);
    }
    
    /**
     * 获取系统日志
     */
    async getLogs(limit = 100, offset = 0, level = null) {
        let sql = `
            SELECT l.*, u.username 
            FROM system_logs l 
            LEFT JOIN users u ON l.user_id = u.id 
        `;
        const params = [];
        
        if (level) {
            sql += ' WHERE l.level = ?';
            params.push(level);
        }
        
        sql += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        return await this.all(sql, params);
    }
    
    /**
     * 创建告警规则
     */
    async createAlertRule(ruleData) {
        const sql = `
            INSERT INTO alert_rules (name, description, metric, operator, threshold, severity, enabled, notification_channels, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        return await this.run(sql, [
            ruleData.name,
            ruleData.description,
            ruleData.metric,
            ruleData.operator,
            ruleData.threshold,
            ruleData.severity || 'warning',
            ruleData.enabled !== false,
            JSON.stringify(ruleData.notificationChannels || []),
            ruleData.createdBy
        ]);
    }
    
    /**
     * 获取告警规则
     */
    async getAlertRules(enabled = null) {
        let sql = 'SELECT * FROM alert_rules';
        const params = [];
        
        if (enabled !== null) {
            sql += ' WHERE enabled = ?';
            params.push(enabled);
        }
        
        sql += ' ORDER BY created_at DESC';
        const rules = await this.all(sql, params);
        
        return rules.map(rule => ({
            ...rule,
            notification_channels: JSON.parse(rule.notification_channels || '[]')
        }));
    }
    
    /**
     * 记录告警触发
     */
    async triggerAlert(ruleId, value, message) {
        const sql = `
            INSERT INTO alert_history (rule_id, value, message)
            VALUES (?, ?, ?)
        `;
        return await this.run(sql, [ruleId, value, message]);
    }
    
    /**
     * 记录性能数据
     */
    async recordPerformance(data) {
        const sql = `
            INSERT INTO performance_history (cpu_usage, memory_usage, disk_usage, network_in, network_out, temperature, load_average)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        return await this.run(sql, [
            data.cpu_usage,
            data.memory_usage,
            data.disk_usage,
            data.network_in,
            data.network_out,
            data.temperature,
            data.load_average
        ]);
    }
    
    /**
     * 获取性能历史数据
     */
    async getPerformanceHistory(hours = 24) {
        const sql = `
            SELECT * FROM performance_history 
            WHERE timestamp > datetime('now', '-${hours} hours')
            ORDER BY timestamp ASC
        `;
        return await this.all(sql);
    }
    
    /**
     * 清理旧数据
     */
    async cleanupOldData(retentionDays = 30) {
        const tables = [
            'system_logs',
            'alert_history',
            'performance_history'
        ];
        
        for (const table of tables) {
            const sql = `DELETE FROM ${table} WHERE created_at < datetime('now', '-${retentionDays} days')`;
            await this.run(sql);
        }
    }
    
    /**
     * 获取系统配置
     */
    async getConfig(key) {
        const sql = 'SELECT value FROM system_config WHERE key = ?';
        const result = await this.get(sql, [key]);
        return result ? result.value : null;
    }
    
    /**
     * 设置系统配置
     */
    async setConfig(key, value, description = null, category = 'general') {
        const sql = `
            INSERT OR REPLACE INTO system_config (key, value, description, category, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        return await this.run(sql, [key, value, description, category]);
    }
    
    /**
     * 关闭数据库连接
     */
    async close() {
        return new Promise((resolve) => {
            this.db.close((err) => {
                if (err) console.error('关闭数据库时出错:', err);
                else console.log('数据库连接已关闭');
                resolve();
            });
        });
    }
}

module.exports = DatabaseManager;