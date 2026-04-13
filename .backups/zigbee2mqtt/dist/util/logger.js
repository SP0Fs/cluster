"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const mkdir_recursive_1 = __importDefault(require("mkdir-recursive"));
const moment_1 = __importDefault(require("moment"));
const path_1 = __importDefault(require("path"));
const rimraf_1 = require("rimraf");
const winston_1 = __importDefault(require("winston"));
const settings = __importStar(require("./settings"));
const NAMESPACE_SEPARATOR = ':';
class Logger {
    level;
    output;
    directory;
    logger;
    fileTransport;
    debugNamespaceIgnoreRegex;
    namespacedLevels;
    cachedNamespacedLevels;
    init() {
        // What transports to enable
        this.output = settings.get().advanced.log_output;
        // Directory to log to
        const timestamp = (0, moment_1.default)(Date.now()).format('YYYY-MM-DD.HH-mm-ss');
        this.directory = settings.get().advanced.log_directory.replace('%TIMESTAMP%', timestamp);
        const logFilename = settings.get().advanced.log_file.replace('%TIMESTAMP%', timestamp);
        this.level = settings.get().advanced.log_level;
        this.namespacedLevels = settings.get().advanced.log_namespaced_levels;
        this.cachedNamespacedLevels = Object.assign({}, this.namespacedLevels);
        (0, assert_1.default)(settings.LOG_LEVELS.includes(this.level), `'${this.level}' is not valid log_level, use one of '${settings.LOG_LEVELS.join(', ')}'`);
        const timestampFormat = () => (0, moment_1.default)().format(settings.get().advanced.timestamp_format);
        this.logger = winston_1.default.createLogger({
            level: 'debug',
            format: winston_1.default.format.combine(winston_1.default.format.errors({ stack: true }), winston_1.default.format.timestamp({ format: timestampFormat })),
            levels: winston_1.default.config.syslog.levels,
        });
        const consoleSilenced = !this.output.includes('console');
        // Print to user what logging is active
        let logging = `Logging to console${consoleSilenced ? ' (silenced)' : ''}`;
        // Setup default console logger
        this.logger.add(new winston_1.default.transports.Console({
            silent: consoleSilenced,
            // winston.config.syslog.levels sets 'warning' as 'red'
            format: winston_1.default.format.combine(winston_1.default.format.colorize({ colors: { debug: 'blue', info: 'green', warning: 'yellow', error: 'red' } }), winston_1.default.format.printf(
            /* istanbul ignore next */ (info) => {
                return `[${info.timestamp}] ${info.level}: \t${info.message}`;
            })),
        }));
        if (this.output.includes('file')) {
            logging += `, file (filename: ${logFilename})`;
            // Make sure that log directory exists when not logging to stdout only
            mkdir_recursive_1.default.mkdirSync(this.directory);
            if (settings.get().advanced.log_symlink_current) {
                const current = settings.get().advanced.log_directory.replace('%TIMESTAMP%', 'current');
                const actual = './' + timestamp;
                /* istanbul ignore next */
                if (fs_1.default.existsSync(current)) {
                    fs_1.default.unlinkSync(current);
                }
                fs_1.default.symlinkSync(actual, current);
            }
            // Add file logger when enabled
            // NOTE: the initiation of the logger even when not added as transport tries to create the logging directory
            const transportFileOptions = {
                filename: path_1.default.join(this.directory, logFilename),
                format: winston_1.default.format.printf(
                /* istanbul ignore next */ (info) => {
                    return `[${info.timestamp}] ${info.level}: \t${info.message}`;
                }),
            };
            if (settings.get().advanced.log_rotation) {
                transportFileOptions.tailable = true;
                transportFileOptions.maxFiles = 3; // Keep last 3 files
                transportFileOptions.maxsize = 10000000; // 10MB
            }
            this.fileTransport = new winston_1.default.transports.File(transportFileOptions);
            this.logger.add(this.fileTransport);
        }
        /* istanbul ignore next */
        if (this.output.includes('syslog')) {
            logging += `, syslog`;
            // eslint-disable-next-line
            require('winston-syslog').Syslog;
            const options = {
                app_name: 'Zigbee2MQTT',
                format: winston_1.default.format.printf((info) => info.message),
                ...settings.get().advanced.log_syslog,
            };
            if (options.hasOwnProperty('type')) {
                options.type = options.type.toString();
            }
            // @ts-expect-error untyped transport
            this.logger.add(new winston_1.default.transports.Syslog(options));
        }
        this.setDebugNamespaceIgnore(settings.get().advanced.log_debug_namespace_ignore);
        this.info(logging);
    }
    get winston() {
        return this.logger;
    }
    addTransport(transport) {
        this.logger.add(transport);
    }
    removeTransport(transport) {
        this.logger.remove(transport);
    }
    getDebugNamespaceIgnore() {
        return this.debugNamespaceIgnoreRegex?.toString().slice(1, -1) /* remove slashes */ ?? '';
    }
    setDebugNamespaceIgnore(value) {
        this.debugNamespaceIgnoreRegex = value != '' ? new RegExp(value) : undefined;
    }
    getLevel() {
        return this.level;
    }
    setLevel(level) {
        this.level = level;
        this.resetCachedNamespacedLevels();
    }
    getNamespacedLevels() {
        return this.namespacedLevels;
    }
    setNamespacedLevels(nsLevels) {
        this.namespacedLevels = nsLevels;
        this.resetCachedNamespacedLevels();
    }
    resetCachedNamespacedLevels() {
        this.cachedNamespacedLevels = Object.assign({}, this.namespacedLevels);
    }
    cacheNamespacedLevel(namespace) {
        let cached = namespace;
        while (this.cachedNamespacedLevels[namespace] == undefined) {
            const sep = cached.lastIndexOf(NAMESPACE_SEPARATOR);
            if (sep === -1) {
                return (this.cachedNamespacedLevels[namespace] = this.level);
            }
            cached = cached.slice(0, sep);
            this.cachedNamespacedLevels[namespace] = this.cachedNamespacedLevels[cached];
        }
        return this.cachedNamespacedLevels[namespace];
    }
    log(level, message, namespace) {
        const nsLevel = this.cacheNamespacedLevel(namespace);
        if (settings.LOG_LEVELS.indexOf(level) <= settings.LOG_LEVELS.indexOf(nsLevel)) {
            this.logger.log(level, `${namespace}: ${message}`);
        }
    }
    error(message, namespace = 'z2m') {
        this.log('error', message, namespace);
    }
    warning(message, namespace = 'z2m') {
        this.log('warning', message, namespace);
    }
    info(message, namespace = 'z2m') {
        this.log('info', message, namespace);
    }
    debug(message, namespace = 'z2m') {
        if (this.debugNamespaceIgnoreRegex?.test(namespace)) {
            return;
        }
        this.log('debug', message, namespace);
    }
    // Cleanup any old log directory.
    cleanup() {
        if (settings.get().advanced.log_directory.includes('%TIMESTAMP%')) {
            const rootDirectory = path_1.default.join(this.directory, '..');
            let directories = fs_1.default.readdirSync(rootDirectory).map((d) => {
                d = path_1.default.join(rootDirectory, d);
                return { path: d, birth: fs_1.default.statSync(d).mtime };
            });
            directories.sort((a, b) => b.birth - a.birth);
            directories = directories.slice(10, directories.length);
            directories.forEach((dir) => {
                this.debug(`Removing old log directory '${dir.path}'`);
                (0, rimraf_1.rimrafSync)(dir.path);
            });
        }
    }
    // Workaround for https://github.com/winstonjs/winston/issues/1629.
    // https://github.com/Koenkk/zigbee2mqtt/pull/10905
    /* istanbul ignore next */
    async end() {
        this.logger.end();
        await new Promise((resolve) => {
            if (!this.fileTransport) {
                process.nextTick(resolve);
            }
            else {
                // @ts-expect-error workaround
                if (this.fileTransport._dest) {
                    // @ts-expect-error workaround
                    this.fileTransport._dest.on('finish', resolve);
                }
                else {
                    // @ts-expect-error workaround
                    this.fileTransport.on('open', () => this.fileTransport._dest.on('finish', resolve));
                }
            }
        });
    }
}
exports.default = new Logger();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL3V0aWwvbG9nZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxvREFBNEI7QUFDNUIsNENBQW9CO0FBQ3BCLHNFQUFpQztBQUNqQyxvREFBNEI7QUFDNUIsZ0RBQXdCO0FBQ3hCLG1DQUFrQztBQUNsQyxzREFBOEI7QUFFOUIscURBQXVDO0FBRXZDLE1BQU0sbUJBQW1CLEdBQUcsR0FBRyxDQUFDO0FBRWhDLE1BQU0sTUFBTTtJQUNBLEtBQUssQ0FBb0I7SUFDekIsTUFBTSxDQUFXO0lBQ2pCLFNBQVMsQ0FBUztJQUNsQixNQUFNLENBQWlCO0lBQ3ZCLGFBQWEsQ0FBMkM7SUFDeEQseUJBQXlCLENBQVU7SUFDbkMsZ0JBQWdCLENBQW9DO0lBQ3BELHNCQUFzQixDQUFvQztJQUUzRCxJQUFJO1FBQ1AsNEJBQTRCO1FBQzVCLElBQUksQ0FBQyxNQUFNLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7UUFDakQsc0JBQXNCO1FBQ3RCLE1BQU0sU0FBUyxHQUFHLElBQUEsZ0JBQU0sRUFBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUNuRSxJQUFJLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDekYsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN2RixJQUFJLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsU0FB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