/**
 * AquaPanel v1.2.0 告警系统模块
 * 提供实时监控告警、规则管理、通知发送等功能
 */

const nodemailer = require('nodemailer');
const EventEmitter = require('events');

class AlertSystem extends EventEmitter {
    constructor(database, config) {
        super();
        this.db = database;
        this.config = config;
        this.emailTransporter = null;
        this.activeAlerts = new Map();
        this.lastCheckTime = new Date();
        
        this.initializeEmailTransporter();
    }
    
    /**
     * 初始化邮件发送器
     */
    initializeEmailTransporter() {
        if (this.config.SMTP_CONFIG.auth.user && this.config.SMTP_CONFIG.auth.pass) {
            try {
                this.emailTransporter = nodemailer.createTransporter(this.config.SMTP_CONFIG);
                console.log('邮件发送器初始化成功');
            } catch (error) {
                console.error('邮件发送器初始化失败:', error);
            }
        }
    }
    
    /**
     * 检查性能数据是否触发告警
     */
    async checkAlerts(performanceData) {
        try {
            const rules = await this.db.getAlertRules(true); // 只获取启用的规则
            
            for (const rule of rules) {
                const value = this.extractMetricValue(performanceData, rule.metric);
                if (value !== null && this.evaluateCondition(value, rule.operator, rule.threshold)) {
                    await this.triggerAlert(rule, value, performanceData);
                }
            }
        } catch (error) {
            console.error('检查告警时出错:', error);
            await this.db.logMessage('error', '告警检查失败', error.message);
        }
    }
    
    /**
     * 从性能数据中提取指标值
     */
    extractMetricValue(data, metric) {
        const metrics = {
            'cpu_usage': data.cpu?.usage,
            'memory_usage': data.memory?.usage,
            'disk_usage': data.disk?.usage,
            'network_in': data.network?.[0]?.rx_sec,
            'network_out': data.network?.[0]?.tx_sec,
            'load_average': data.cpu?.cores?.reduce((sum, core) => sum + core.load, 0) / data.cpu?.cores?.length,
            'swap_usage': data.memory?.swap ? (data.memory.swap.used / data.memory.swap.total) * 100 : 0,
            'process_count': data.processes?.all
        };
        
        return metrics[metric] || null;
    }
    
    /**
     * 评估告警条件
     */
    evaluateCondition(value, operator, threshold) {
        switch (operator) {
            case '>':
            case 'gt':
                return value > threshold;
            case '>=':
            case 'gte':
                return value >= threshold;
            case '<':
            case 'lt':
                return value < threshold;
            case '<=':
            case 'lte':
                return value <= threshold;
            case '==':
            case 'eq':
                return value === threshold;
            case '!=':
            case 'ne':
                return value !== threshold;
            default:
                return false;
        }
    }
    
    /**
     * 触发告警
     */
    async triggerAlert(rule, value, performanceData) {
        const alertKey = `${rule.id}_${rule.metric}`;
        const now = new Date();
        
        // 检查是否已经有活跃的告警（防止重复告警）
        if (this.activeAlerts.has(alertKey)) {
            const lastAlert = this.activeAlerts.get(alertKey);
            const timeDiff = now - lastAlert.timestamp;
            
            // 如果距离上次告警不到5分钟，跳过
            if (timeDiff < 5 * 60 * 1000) {
                return;
            }
        }
        
        const message = `告警触发: ${rule.name} - ${rule.metric} 当前值: ${value.toFixed(2)}, 阈值: ${rule.threshold}`;
        
        try {
            // 记录告警历史
            await this.db.triggerAlert(rule.id, value, message);
            
            // 记录到活跃告警
            this.activeAlerts.set(alertKey, {
                rule,
                value,
                timestamp: now,
                message
            });
            
            // 发送通知
            await this.sendNotifications(rule, value, message, performanceData);
            
            // 触发事件
            this.emit('alertTriggered', {
                rule,
                value,
                message,
                timestamp: now
            });
            
            console.log(`🚨 告警触发: ${rule.name} - ${value.toFixed(2)}`);
            
        } catch (error) {
            console.error('触发告警时出错:', error);
            await this.db.logMessage('error', '告警触发失败', error.message);
        }
    }
    
    /**
     * 发送告警通知
     */
    async sendNotifications(rule, value, message, performanceData) {
        const channels = rule.notification_channels || [];
        
        for (const channel of channels) {
            try {
                switch (channel.type) {
                    case 'email':
                        await this.sendEmailNotification(channel, rule, value, message, performanceData);
                        break;
                    case 'webhook':
                        await this.sendWebhookNotification(channel, rule, value, message, performanceData);
                        break;
                    case 'console':
                        console.log(`📧 告警通知: ${message}`);
                        break;
                }
            } catch (error) {
                console.error(`发送${channel.type}通知失败:`, error);
            }
        }
    }
    
    /**
     * 发送邮件通知
     */
    async sendEmailNotification(channel, rule, value, message, performanceData) {
        if (!this.emailTransporter) {
            throw new Error('邮件发送器未初始化');
        }
        
        const subject = `🚨 AquaPanel告警 - ${rule.name}`;
        const html = this.generateEmailTemplate(rule, value, message, performanceData);
        
        const mailOptions = {
            from: this.config.SMTP_CONFIG.auth.user,
            to: channel.recipients || this.config.NOTIFICATION_EMAIL,
            subject,
            html
        };
        
        await this.emailTransporter.sendMail(mailOptions);
        console.log(`📧 邮件告警已发送: ${rule.name}`);
    }
    
    /**
     * 生成邮件模板
     */
    generateEmailTemplate(rule, value, message, performanceData) {
        const timestamp = new Date().toLocaleString('zh-CN');
        const severityColors = {
            'info': '#3498db',
            'warning': '#f39c12',
            'error': '#e74c3c',
            'critical': '#8e44ad'
        };
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f8f9fa; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, ${severityColors[rule.severity] || '#3498db'}, ${severityColors[rule.severity] || '#3498db'}dd); color: white; padding: 20px; text-align: center; }
                .content { padding: 30px; }
                .alert-info { background: #f8f9fa; border-left: 4px solid ${severityColors[rule.severity] || '#3498db'}; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .metrics { display: flex; justify-content: space-between; margin: 20px 0; }
                .metric { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px; flex: 1; margin: 0 5px; }
                .metric-value { font-size: 24px; font-weight: bold; color: ${severityColors[rule.severity] || '#3498db'}; }
                .metric-label { font-size: 12px; color: #666; text-transform: uppercase; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
                .btn { display: inline-block; padding: 12px 24px; background: ${severityColors[rule.severity] || '#3498db'}; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚨 系统告警通知</h1>
                    <p>AquaPanel 监控系统</p>
                </div>
                
                <div class="content">
                    <div class="alert-info">
                        <h3>${rule.name}</h3>
                        <p><strong>告警级别:</strong> ${rule.severity.toUpperCase()}</p>
                        <p><strong>触发时间:</strong> ${timestamp}</p>
                        <p><strong>告警描述:</strong> ${rule.description || '无描述'}</p>
                        <p><strong>当前值:</strong> ${value.toFixed(2)} ${rule.metric.includes('usage') ? '%' : ''}</p>
                        <p><strong>阈值:</strong> ${rule.threshold} ${rule.metric.includes('usage') ? '%' : ''}</p>
                    </div>
                    
                    <h4>当前系统状态</h4>
                    <div class="metrics">
                        <div class="metric">
                            <div class="metric-value">${performanceData.cpu?.usage?.toFixed(1) || '0'}%</div>
                            <div class="metric-label">CPU使用率</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${performanceData.memory?.usage?.toFixed(1) || '0'}%</div>
                            <div class="metric-label">内存使用率</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${performanceData.processes?.all || '0'}</div>
                            <div class="metric-label">运行进程</div>
                        </div>
                    </div>
                    
                    <p style="text-align: center;">
                        <a href="http://localhost:${this.config.PORT}" class="btn">访问监控面板</a>
                    </p>
                </div>
                
                <div class="footer">
                    <p>此邮件由 AquaPanel v1.2.0-enterprise 自动发送</p>
                    <p>如需停止接收告警邮件，请联系系统管理员</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }
    
    /**
     * 发送Webhook通知
     */
    async sendWebhookNotification(channel, rule, value, message, performanceData) {
        const payload = {
            alert: {
                rule: rule.name,
                metric: rule.metric,
                value: value,
                threshold: rule.threshold,
                severity: rule.severity,
                message: message,
                timestamp: new Date().toISOString()
            },
            system: {
                cpu: performanceData.cpu?.usage,
                memory: performanceData.memory?.usage,
                processes: performanceData.processes?.all
            }
        };
        
        // 这里可以使用 fetch 或其他 HTTP 客户端发送 webhook
        console.log(`🔗 Webhook告警: ${JSON.stringify(payload)}`);
    }
    
    /**
     * 创建告警规则
     */
    async createRule(ruleData, userId) {
        const rule = {
            ...ruleData,
            createdBy: userId
        };
        
        return await this.db.createAlertRule(rule);
    }
    
    /**
     * 获取告警规则
     */
    async getRules(enabled = null) {
        return await this.db.getAlertRules(enabled);
    }
    
    /**
     * 更新告警规则
     */
    async updateRule(ruleId, updates) {
        // 这里需要实现数据库的更新方法
        console.log(`更新告警规则 ${ruleId}:`, updates);
    }
    
    /**
     * 删除告警规则
     */
    async deleteRule(ruleId) {
        // 这里需要实现数据库的删除方法
        console.log(`删除告警规则: ${ruleId}`);
    }
    
    /**
     * 获取告警历史
     */
    async getAlertHistory(limit = 50, ruleId = null) {
        let sql = `
            SELECT ah.*, ar.name as rule_name, ar.metric, ar.severity
            FROM alert_history ah
            LEFT JOIN alert_rules ar ON ah.rule_id = ar.id
        `;
        const params = [];
        
        if (ruleId) {
            sql += ' WHERE ah.rule_id = ?';
            params.push(ruleId);
        }
        
        sql += ' ORDER BY ah.triggered_at DESC LIMIT ?';
        params.push(limit);
        
        return await this.db.all(sql, params);
    }
    
    /**
     * 确认告警
     */
    async acknowledgeAlert(alertId, userId) {
        const sql = `
            UPDATE alert_history 
            SET acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP, status = 'acknowledged'
            WHERE id = ?
        `;
        return await this.db.run(sql, [userId, alertId]);
    }
    
    /**
     * 解决告警
     */
    async resolveAlert(alertId, userId) {
        const sql = `
            UPDATE alert_history 
            SET resolved_at = CURRENT_TIMESTAMP, status = 'resolved'
            WHERE id = ?
        `;
        const result = await this.db.run(sql, [alertId]);
        
        // 从活跃告警中移除
        for (const [key, alert] of this.activeAlerts.entries()) {
            if (alert.id === alertId) {
                this.activeAlerts.delete(key);
                break;
            }
        }
        
        return result;
    }
    
    /**
     * 获取活跃告警
     */
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }
    
    /**
     * 清理过期的活跃告警
     */
    cleanupActiveAlerts() {
        const now = new Date();
        const maxAge = 24 * 60 * 60 * 1000; // 24小时
        
        for (const [key, alert] of this.activeAlerts.entries()) {
            if (now - alert.timestamp > maxAge) {
                this.activeAlerts.delete(key);
            }
        }
    }
    
    /**
     * 测试告警规则
     */
    async testRule(rule, testData) {
        const value = this.extractMetricValue(testData, rule.metric);
        const triggered = value !== null && this.evaluateCondition(value, rule.operator, rule.threshold);
        
        return {
            triggered,
            value,
            message: triggered ? `测试告警: ${rule.name} - 当前值: ${value}, 阈值: ${rule.threshold}` : '规则未触发'
        };
    }
    
    /**
     * 获取告警统计
     */
    async getAlertStats(days = 7) {
        const sql = `
            SELECT 
                DATE(triggered_at) as date,
                COUNT(*) as count,
                ar.severity,
                ar.metric
            FROM alert_history ah
            LEFT JOIN alert_rules ar ON ah.rule_id = ar.id
            WHERE ah.triggered_at > datetime('now', '-${days} days')
            GROUP BY DATE(triggered_at), ar.severity, ar.metric
            ORDER BY triggered_at DESC
        `;
        
        return await this.db.all(sql);
    }
}

module.exports = AlertSystem;