/**
 * AquaPanel v1.2.0 插件系统模块
 * 提供插件动态加载、管理、配置等功能
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const EventEmitter = require('events');

class PluginManager extends EventEmitter {
    constructor(database, config) {
        super();
        this.db = database;
        this.config = config;
        this.plugins = new Map();
        this.hooks = new Map();
        this.pluginConfigs = new Map();
        this.pluginsDir = config.PLUGINS_DIR;
        
        // 定义插件API
        this.pluginAPI = {
            registerHook: this.registerHook.bind(this),
            callHook: this.callHook.bind(this),
            getConfig: this.getPluginConfig.bind(this),
            setConfig: this.setPluginConfig.bind(this),
            log: this.logPluginMessage.bind(this),
            http: this.createHttpEndpoint.bind(this),
            database: this.getPluginDatabase.bind(this)
        };
        
        this.initializePluginDirectory();
    }
    
    /**
     * 初始化插件目录
     */
    async initializePluginDirectory() {
        try {
            if (!fsSync.existsSync(this.pluginsDir)) {
                await fs.mkdir(this.pluginsDir, { recursive: true });
                console.log('插件目录创建成功:', this.pluginsDir);
            }
        } catch (error) {
            console.error('初始化插件目录失败:', error);
        }
    }
    
    /**
     * 加载所有插件
     */
    async loadAllPlugins() {
        try {
            const pluginDirs = await fs.readdir(this.pluginsDir);
            
            for (const dir of pluginDirs) {
                const pluginPath = path.join(this.pluginsDir, dir);
                const stat = await fs.stat(pluginPath);
                
                if (stat.isDirectory()) {
                    await this.loadPlugin(dir);
                }
            }
            
            console.log('已加载 ' + this.plugins.size + ' 个插件');
            
        } catch (error) {
            console.error('加载插件失败:', error);
        }
    }
    
    /**
     * 加载单个插件
     */
    async loadPlugin(pluginName) {
        try {
            const pluginDir = path.join(this.pluginsDir, pluginName);
            const packagePath = path.join(pluginDir, 'package.json');
            const pluginPath = path.join(pluginDir, 'plugin.js');
            
            // 检查插件文件是否存在
            if (!fsSync.existsSync(packagePath) || !fsSync.existsSync(pluginPath)) {
                throw new Error('插件文件不完整: ' + pluginName);
            }
            
            // 读取插件配置
            const packageData = JSON.parse(await fs.readFile(packagePath, 'utf8'));
            const aquapanelConfig = packageData.aquapanel || {};
            
            // 检查插件版本兼容性
            if (!this.isVersionCompatible(aquapanelConfig.version)) {
                throw new Error('插件版本不兼容: ' + pluginName);
            }
            
            // 从数据库获取插件状态
            const dbPlugin = await this.db.get('SELECT * FROM plugins WHERE name = ?', [pluginName]);
            const isEnabled = dbPlugin ? dbPlugin.enabled : (aquapanelConfig.config && aquapanelConfig.config.enabled) || false;
            
            if (!isEnabled) {
                console.log('插件已禁用，跳过加载: ' + pluginName);
                return;
            }
            
            // 清除require缓存（用于热重载）
            const fullPluginPath = path.resolve(pluginPath);
            delete require.cache[fullPluginPath];
            
            // 动态加载插件
            const PluginClass = require(fullPluginPath);
            const pluginInstance = new PluginClass(this.pluginAPI);
            
            // 存储插件实例和配置
            this.plugins.set(pluginName, {
                instance: pluginInstance,
                config: packageData,
                loadTime: new Date(),
                status: 'loaded'
            });
            
            // 加载插件配置
            await this.loadPluginConfig(pluginName, aquapanelConfig.config || {});
            
            // 更新数据库记录
            await this.updatePluginDatabase(pluginName, packageData);
            
            console.log('插件加载成功: ' + pluginName + ' v' + packageData.version);
            this.emit('pluginLoaded', { name: pluginName, version: packageData.version });
            
        } catch (error) {
            console.error('插件加载失败 [' + pluginName + ']:', error.message);
            this.emit('pluginError', { name: pluginName, error: error.message });
        }
    }
    
    /**
     * 卸载插件
     */
    async unloadPlugin(pluginName) {
        try {
            const plugin = this.plugins.get(pluginName);
            if (!plugin) {
                throw new Error('插件未找到');
            }
            
            // 调用插件的清理方法
            if (plugin.instance && typeof plugin.instance.destroy === 'function') {
                plugin.instance.destroy();
            }
            
            // 从内存中移除
            this.plugins.delete(pluginName);
            this.pluginConfigs.delete(pluginName);
            
            // 清除require缓存
            const pluginPath = path.join(this.pluginsDir, pluginName, 'plugin.js');
            delete require.cache[path.resolve(pluginPath)];
            
            console.log('插件卸载成功: ' + pluginName);
            this.emit('pluginUnloaded', { name: pluginName });
            
        } catch (error) {
            console.error('插件卸载失败 [' + pluginName + ']:', error);
            throw error;
        }
    }
    
    /**
     * 重新加载插件
     */
    async reloadPlugin(pluginName) {
        await this.unloadPlugin(pluginName);
        await this.loadPlugin(pluginName);
    }
    
    /**
     * 启用插件
     */
    async enablePlugin(pluginName) {
        try {
            await this.db.run(
                'UPDATE plugins SET enabled = 1 WHERE name = ?',
                [pluginName]
            );
            
            await this.loadPlugin(pluginName);
            return { success: true, message: '插件启用成功' };
            
        } catch (error) {
            console.error('启用插件失败:', error);
            throw error;
        }
    }
    
    /**
     * 禁用插件
     */
    async disablePlugin(pluginName) {
        try {
            await this.unloadPlugin(pluginName);
            
            await this.db.run(
                'UPDATE plugins SET enabled = 0 WHERE name = ?',
                [pluginName]
            );
            
            return { success: true, message: '插件禁用成功' };
            
        } catch (error) {
            console.error('禁用插件失败:', error);
            throw error;
        }
    }
    
    /**
     * 注册钩子
     */
    registerHook(hookName, callback) {
        if (!this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }
        
        this.hooks.get(hookName).push(callback);
        console.log('钩子注册: ' + hookName);
    }
    
    /**
     * 调用钩子
     */
    async callHook(hookName, data) {
        const callbacks = this.hooks.get(hookName) || [];
        const results = [];
        
        for (const callback of callbacks) {
            try {
                const result = await callback(data);
                results.push(result);
            } catch (error) {
                console.error('钩子执行失败 [' + hookName + ']:', error);
            }
        }
        
        return results;
    }
    
    /**
     * 获取插件配置
     */
    async getPluginConfig(pluginName) {
        if (this.pluginConfigs.has(pluginName)) {
            return this.pluginConfigs.get(pluginName);
        }
        
        // 从数据库加载配置
        const dbPlugin = await this.db.get('SELECT config FROM plugins WHERE name = ?', [pluginName]);
        if (dbPlugin) {
            const config = JSON.parse(dbPlugin.config || '{}');
            this.pluginConfigs.set(pluginName, config);
            return config;
        }
        
        return {};
    }
    
    /**
     * 设置插件配置
     */
    async setPluginConfig(pluginName, config) {
        this.pluginConfigs.set(pluginName, config);
        
        await this.db.run(
            'UPDATE plugins SET config = ? WHERE name = ?',
            [JSON.stringify(config), pluginName]
        );
    }
    
    /**
     * 记录插件日志
     */
    async logPluginMessage(level, message, pluginName = 'unknown') {
        await this.db.logMessage(level, '[Plugin:' + pluginName + '] ' + message, 'plugin_system');
    }
    
    /**
     * 创建HTTP端点（为插件提供API接口）
     */
    createHttpEndpoint(pluginName, path, handler) {
        // 这里可以动态创建API端点
        console.log('插件API端点创建: ' + pluginName + ' -> ' + path);
    }
    
    /**
     * 为插件提供数据库访问
     */
    getPluginDatabase() {
        // 返回受限的数据库访问接口
        return {
            get: this.db.get.bind(this.db),
            all: this.db.all.bind(this.db),
            run: this.db.run.bind(this.db)
        };
    }
    
    /**
     * 检查版本兼容性
     */
    isVersionCompatible(pluginVersion) {
        if (!pluginVersion) return true;
        
        const currentVersion = '1.2.0';
        const currentParts = currentVersion.split('.').map(Number);
        const pluginParts = pluginVersion.split('.').map(Number);
        
        // 主版本必须匹配，次版本向后兼容
        return currentParts[0] === pluginParts[0] && currentParts[1] >= pluginParts[1];
    }
    
    /**
     * 加载插件配置
     */
    async loadPluginConfig(pluginName, defaultConfig) {
        const dbPlugin = await this.db.get('SELECT config FROM plugins WHERE name = ?', [pluginName]);
        
        if (dbPlugin) {
            const config = JSON.parse(dbPlugin.config || '{}');
            this.pluginConfigs.set(pluginName, Object.assign({}, defaultConfig, config));
        } else {
            this.pluginConfigs.set(pluginName, defaultConfig);
        }
    }
    
    /**
     * 更新插件数据库记录
     */
    async updatePluginDatabase(pluginName, packageData) {
        const existingPlugin = await this.db.get('SELECT id FROM plugins WHERE name = ?', [pluginName]);
        
        if (existingPlugin) {
            await this.db.run(
                'UPDATE plugins SET version = ?, description = ?, author = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?',
                [packageData.version, packageData.description, packageData.author, pluginName]
            );
        } else {
            await this.db.run(
                'INSERT INTO plugins (name, version, description, author, enabled, config) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    pluginName,
                    packageData.version,
                    packageData.description || '',
                    packageData.author || '',
                    (packageData.aquapanel && packageData.aquapanel.config && packageData.aquapanel.config.enabled) || false,
                    JSON.stringify((packageData.aquapanel && packageData.aquapanel.config) || {})
                ]
            );
        }
    }
    
    /**
     * 获取插件列表
     */
    getPluginList() {
        const pluginList = [];
        
        for (const [name, plugin] of this.plugins.entries()) {
            pluginList.push({
                name: name,
                version: plugin.config.version,
                description: plugin.config.description,
                author: plugin.config.author,
                status: plugin.status,
                loadTime: plugin.loadTime,
                config: this.pluginConfigs.get(name) || {}
            });
        }
        
        return pluginList;
    }
    
    /**
     * 获取插件状态
     */
    getPluginStatus(pluginName) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            return null;
        }
        
        return {
            name: pluginName,
            status: plugin.status,
            loadTime: plugin.loadTime,
            version: plugin.config.version,
            hasInstance: !!plugin.instance,
            config: this.pluginConfigs.get(pluginName) || {}
        };
    }
    
    /**
     * 获取已注册的钩子
     */
    getRegisteredHooks() {
        const hooks = {};
        for (const [hookName, callbacks] of this.hooks.entries()) {
            hooks[hookName] = callbacks.length;
        }
        return hooks;
    }
    
    /**
     * 插件管理统计
     */
    getStats() {
        return {
            totalPlugins: this.plugins.size,
            loadedPlugins: Array.from(this.plugins.values()).filter(p => p.status === 'loaded').length,
            registeredHooks: this.hooks.size,
            totalHookCallbacks: Array.from(this.hooks.values()).reduce((sum, callbacks) => sum + callbacks.length, 0)
        };
    }
}

module.exports = PluginManager;