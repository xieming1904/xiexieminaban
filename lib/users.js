/**
 * AquaPanel v1.2.0 用户管理模块
 * 提供用户注册、认证、权限管理、用户资料等功能
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');

class UserManager {
    constructor(database, config) {
        this.db = database;
        this.config = config;
        this.activeSessions = new Map();
        
        // 定义用户验证规则
        this.userValidationSchema = Joi.object({
            username: Joi.string().alphanum().min(3).max(20).required(),
            password: Joi.string().min(6).max(50).required(),
            email: Joi.string().email().optional(),
            role: Joi.string().valid('admin', 'user', 'viewer').default('user'),
            avatar: Joi.string().uri().optional()
        });
        
        // 定义用户更新验证规则
        this.userUpdateSchema = Joi.object({
            password: Joi.string().min(6).max(50).optional(),
            email: Joi.string().email().optional(),
            role: Joi.string().valid('admin', 'user', 'viewer').optional(),
            avatar: Joi.string().uri().optional(),
            preferences: Joi.object().optional()
        });
    }
    
    /**
     * 创建新用户
     */
    async createUser(userData, creatorRole = 'admin') {
        try {
            // 验证输入数据
            const { error, value } = this.userValidationSchema.validate(userData);
            if (error) {
                throw new Error(`用户数据验证失败: ${error.details[0].message}`);
            }
            
            // 检查用户名是否已存在
            const existingUser = await this.db.getUser(value.username);
            if (existingUser) {
                throw new Error('用户名已存在');
            }
            
            // 检查邮箱是否已存在
            if (value.email) {
                const emailCheck = await this.db.get('SELECT id FROM users WHERE email = ?', [value.email]);
                if (emailCheck) {
                    throw new Error('邮箱已被注册');
                }
            }
            
            // 权限检查：只有管理员才能创建管理员账户
            if (value.role === 'admin' && creatorRole !== 'admin') {
                throw new Error('权限不足：无法创建管理员账户');
            }
            
            // 加密密码
            const hashedPassword = await bcrypt.hash(value.password, 12);
            
            // 创建用户对象
            const newUser = {
                username: value.username,
                password: hashedPassword,
                email: value.email,
                role: value.role,
                avatar: value.avatar || this.generateDefaultAvatar(value.username),
                preferences: this.getDefaultPreferences()
            };
            
            // 保存到数据库
            const result = await this.db.createUser(newUser);
            
            // 记录日志
            await this.db.logMessage('info', `新用户创建: ${value.username}`, 'user_management');
            
            return {
                success: true,
                userId: result.lastID,
                message: '用户创建成功'
            };
            
        } catch (error) {
            console.error('创建用户失败:', error);
            throw error;
        }
    }
    
    /**
     * 用户登录
     */
    async loginUser(username, password, ipAddress = null, userAgent = null) {
        try {
            // 检查登录失败限制
            if (!this.checkLoginAttempts(username)) {
                throw new Error('登录失败次数过多，请稍后再试');
            }
            
            // 获取用户
            const user = await this.db.getUser(username);
            if (!user) {
                this.recordLoginFailure(username);
                throw new Error('用户名或密码错误');
            }
            
            // 检查账户是否被锁定
            if (user.locked_until && new Date(user.locked_until) > new Date()) {
                throw new Error('账户已被锁定，请稍后再试');
            }
            
            // 验证密码
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                this.recordLoginFailure(username);
                await this.db.updateUser(username, {
                    login_attempts: (user.login_attempts || 0) + 1
                });
                throw new Error('用户名或密码错误');
            }
            
            // 登录成功，重置失败计数
            this.clearLoginAttempts(username);
            
            // 生成JWT令牌
            const tokenPayload = {
                userId: user.id,
                username: user.username,
                role: user.role,
                iat: Math.floor(Date.now() / 1000)
            };
            
            const token = jwt.sign(tokenPayload, this.config.JWT_SECRET, { expiresIn: '24h' });
            
            // 创建会话记录
            const sessionToken = uuidv4();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时后过期
            
            await this.db.run(
                'INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
                [user.id, sessionToken, ipAddress, userAgent, expiresAt.toISOString()]
            );
            
            // 更新最后登录时间
            await this.db.updateUser(username, {
                last_login: new Date().toISOString(),
                login_attempts: 0
            });
            
            // 记录登录日志
            await this.db.logMessage('info', `用户登录: ${username}`, 'authentication', user.id, ipAddress, userAgent);
            
            // 添加到活跃会话
            this.activeSessions.set(sessionToken, {
                userId: user.id,
                username: user.username,
                role: user.role,
                loginTime: new Date(),
                ipAddress,
                userAgent
            });
            
            return {
                success: true,
                token,
                sessionToken,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    avatar: user.avatar,
                    preferences: user.preferences,
                    lastLogin: user.last_login
                }
            };
            
        } catch (error) {
            console.error('用户登录失败:', error);
            throw error;
        }
    }
    
    /**
     * 用户登出
     */
    async logoutUser(sessionToken, userId = null) {
        try {
            // 从活跃会话中移除
            this.activeSessions.delete(sessionToken);
            
            // 更新数据库会话状态
            await this.db.run(
                'UPDATE user_sessions SET is_active = 0 WHERE session_token = ?',
                [sessionToken]
            );
            
            // 记录登出日志
            if (userId) {
                await this.db.logMessage('info', '用户登出', 'authentication', userId);
            }
            
            return { success: true, message: '登出成功' };
            
        } catch (error) {
            console.error('用户登出失败:', error);
            throw error;
        }
    }
    
    /**
     * 更新用户信息
     */
    async updateUser(username, updates, updaterRole = 'user') {
        try {
            // 验证更新数据
            const { error, value } = this.userUpdateSchema.validate(updates);
            if (error) {
                throw new Error(`更新数据验证失败: ${error.details[0].message}`);
            }
            
            // 获取要更新的用户
            const user = await this.db.getUser(username);
            if (!user) {
                throw new Error('用户不存在');
            }
            
            // 权限检查
            if (value.role && value.role === 'admin' && updaterRole !== 'admin') {
                throw new Error('权限不足：无法设置管理员角色');
            }
            
            // 如果更新密码，需要加密
            if (value.password) {
                value.password = await bcrypt.hash(value.password, 12);
            }
            
            // 更新用户
            await this.db.updateUser(username, value);
            
            // 记录日志
            await this.db.logMessage('info', `用户信息更新: ${username}`, 'user_management');
            
            return { success: true, message: '用户信息更新成功' };
            
        } catch (error) {
            console.error('更新用户失败:', error);
            throw error;
        }
    }
    
    /**
     * 删除用户
     */
    async deleteUser(username, deleterRole = 'admin') {
        try {
            // 权限检查
            if (deleterRole !== 'admin') {
                throw new Error('权限不足：只有管理员可以删除用户');
            }
            
            // 检查用户是否存在
            const user = await this.db.getUser(username);
            if (!user) {
                throw new Error('用户不存在');
            }
            
            // 不能删除自己
            if (username === 'admin') {
                throw new Error('不能删除默认管理员账户');
            }
            
            // 软删除（设置为非活跃状态）
            await this.db.updateUser(username, { is_active: 0 });
            
            // 结束所有活跃会话
            await this.db.run('UPDATE user_sessions SET is_active = 0 WHERE user_id = ?', [user.id]);
            
            // 记录日志
            await this.db.logMessage('warning', `用户删除: ${username}`, 'user_management');
            
            return { success: true, message: '用户删除成功' };
            
        } catch (error) {
            console.error('删除用户失败:', error);
            throw error;
        }
    }
    
    /**
     * 获取用户列表
     */
    async getUserList(page = 1, limit = 20, role = null) {
        try {
            const offset = (page - 1) * limit;
            let sql = `
                SELECT id, username, email, role, avatar, created_at, last_login, is_active,
                       (SELECT COUNT(*) FROM user_sessions WHERE user_id = users.id AND is_active = 1) as active_sessions
                FROM users 
                WHERE is_active = 1
            `;
            const params = [];
            
            if (role) {
                sql += ' AND role = ?';
                params.push(role);
            }
            
            sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);
            
            const users = await this.db.all(sql, params);
            
            // 获取总数
            let countSql = 'SELECT COUNT(*) as total FROM users WHERE is_active = 1';
            const countParams = [];
            
            if (role) {
                countSql += ' AND role = ?';
                countParams.push(role);
            }
            
            const countResult = await this.db.get(countSql, countParams);
            const total = countResult.total;
            
            return {
                users,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
            
        } catch (error) {
            console.error('获取用户列表失败:', error);
            throw error;
        }
    }
    
    /**
     * 获取用户详细信息
     */
    async getUserProfile(username) {
        try {
            const user = await this.db.getUser(username);
            if (!user) {
                throw new Error('用户不存在');
            }
            
            // 获取用户的会话信息
            const sessions = await this.db.all(
                'SELECT session_token, ip_address, user_agent, created_at, expires_at, is_active FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
                [user.id]
            );
            
            // 获取用户操作日志
            const logs = await this.db.all(
                'SELECT level, message, context, created_at FROM system_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
                [user.id]
            );
            
            // 返回用户资料（不包含密码）
            const { password, ...userProfile } = user;
            
            return {
                ...userProfile,
                sessions,
                recentLogs: logs,
                stats: {
                    totalSessions: sessions.length,
                    activeSessions: sessions.filter(s => s.is_active).length,
                    lastActivity: user.last_login
                }
            };
            
        } catch (error) {
            console.error('获取用户资料失败:', error);
            throw error;
        }
    }
    
    /**
     * 验证JWT令牌
     */
    verifyToken(token) {
        try {
            return jwt.verify(token, this.config.JWT_SECRET);
        } catch (error) {
            return null;
        }
    }
    
    /**
     * 检查用户权限
     */
    hasPermission(userRole, requiredRole) {
        const roleHierarchy = {
            'viewer': 1,
            'user': 2,
            'admin': 3
        };
        
        return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
    }
    
    /**
     * 检查登录失败限制
     */
    checkLoginAttempts(username) {
        // 这里可以实现更复杂的失败限制逻辑
        return true;
    }
    
    /**
     * 记录登录失败
     */
    recordLoginFailure(username) {
        // 记录登录失败
        console.log(`登录失败: ${username}`);
    }
    
    /**
     * 清除登录失败记录
     */
    clearLoginAttempts(username) {
        // 清除登录失败记录
        console.log(`清除登录失败记录: ${username}`);
    }
    
    /**
     * 生成默认头像
     */
    generateDefaultAvatar(username) {
        // 生成基于用户名的默认头像URL
        const colors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7', 'DDA0DD', 'FF7675', '74B9FF'];
        const colorIndex = username.charCodeAt(0) % colors.length;
        const color = colors[colorIndex];
        
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=${color}&color=fff&size=128`;
    }
    
    /**
     * 获取默认用户偏好设置
     */
    getDefaultPreferences() {
        return {
            theme: 'liquid-glass',
            language: 'zh-CN',
            timezone: 'Asia/Shanghai',
            notifications: {
                email: true,
                browser: true,
                sound: false
            },
            dashboard: {
                refreshInterval: 2000,
                defaultPage: 'overview',
                showAnimations: true
            },
            charts: {
                type: 'line',
                timeRange: '1h',
                autoRefresh: true
            }
        };
    }
    
    /**
     * 更新用户偏好设置
     */
    async updateUserPreferences(username, preferences) {
        try {
            const user = await this.db.getUser(username);
            if (!user) {
                throw new Error('用户不存在');
            }
            
            // 合并现有偏好设置
            const currentPreferences = user.preferences || this.getDefaultPreferences();
            const updatedPreferences = { ...currentPreferences, ...preferences };
            
            await this.db.updateUser(username, { preferences: updatedPreferences });
            
            return { success: true, preferences: updatedPreferences };
            
        } catch (error) {
            console.error('更新用户偏好失败:', error);
            throw error;
        }
    }
    
    /**
     * 获取活跃会话
     */
    getActiveSessions() {
        return Array.from(this.activeSessions.entries()).map(([sessionToken, session]) => ({
            sessionToken,
            ...session
        }));
    }
    
    /**
     * 清理过期会话
     */
    async cleanupExpiredSessions() {
        try {
            // 清理数据库中的过期会话
            await this.db.run('UPDATE user_sessions SET is_active = 0 WHERE expires_at < datetime("now")');
            
            // 清理内存中的过期会话
            const now = new Date();
            for (const [sessionToken, session] of this.activeSessions.entries()) {
                if (session.expiresAt && session.expiresAt < now) {
                    this.activeSessions.delete(sessionToken);
                }
            }
            
            console.log('过期会话清理完成');
            
        } catch (error) {
            console.error('清理过期会话失败:', error);
        }
    }
    
    /**
     * 获取用户统计信息
     */
    async getUserStats() {
        try {
            const stats = await this.db.all(`
                SELECT 
                    COUNT(*) as total_users,
                    SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_count,
                    SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_count,
                    SUM(CASE WHEN role = 'viewer' THEN 1 ELSE 0 END) as viewer_count,
                    SUM(CASE WHEN last_login > datetime('now', '-7 days') THEN 1 ELSE 0 END) as active_last_week,
                    SUM(CASE WHEN created_at > datetime('now', '-30 days') THEN 1 ELSE 0 END) as new_last_month
                FROM users 
                WHERE is_active = 1
            `);
            
            const sessionStats = await this.db.all(`
                SELECT COUNT(*) as active_sessions
                FROM user_sessions 
                WHERE is_active = 1 AND expires_at > datetime('now')
            `);
            
            return {
                ...stats[0],
                active_sessions: sessionStats[0].active_sessions
            };
            
        } catch (error) {
            console.error('获取用户统计失败:', error);
            throw error;
        }
    }
}

module.exports = UserManager;