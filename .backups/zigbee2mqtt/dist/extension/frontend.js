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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const connect_gzip_static_1 = __importDefault(require("connect-gzip-static"));
const finalhandler_1 = __importDefault(require("finalhandler"));
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const url_1 = __importDefault(require("url"));
const ws_1 = __importDefault(require("ws"));
const zigbee2mqtt_frontend_1 = __importDefault(require("zigbee2mqtt-frontend"));
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
/**
 * This extension servers the frontend
 */
class Frontend extends extension_1.default {
    mqttBaseTopic = settings.get().mqtt.base_topic;
    host = settings.get().frontend.host;
    port = settings.get().frontend.port;
    sslCert = settings.get().frontend.ssl_cert;
    sslKey = settings.get().frontend.ssl_key;
    authToken = settings.get().frontend.auth_token;
    server;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fileServer;
    wss = null;
    isHttpsConfigured() {
        if (this.sslCert && this.sslKey) {
            if (!fs_1.default.existsSync(this.sslCert) || !fs_1.default.existsSync(this.sslKey)) {
                logger_1.default.error(`defined ssl_cert '${this.sslCert}' or ssl_key '${this.sslKey}' file path does not exists, server won't be secured.`);
                return false;
            }
            return true;
        }
        return false;
    }
    async start() {
        if (this.isHttpsConfigured()) {
            const serverOptions = {
                key: fs_1.default.readFileSync(this.sslKey),
                cert: fs_1.default.readFileSync(this.sslCert),
            };
            this.server = https_1.default.createServer(serverOptions, this.onRequest);
        }
        else {
            this.server = http_1.default.createServer(this.onRequest);
        }
        this.server.on('upgrade', this.onUpgrade);
        /* istanbul ignore next */
        const options = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setHeaders: (res, path) => {
                if (path.endsWith('index.html')) {
                    res.setHeader('Cache-Control', 'no-store');
                }
            },
        };
        this.fileServer = (0, connect_gzip_static_1.default)(zigbee2mqtt_frontend_1.default.getPath(), options);
        this.wss = new ws_1.default.Server({ noServer: true });
        this.wss.on('connection', this.onWebSocketConnection);
        this.eventBus.onMQTTMessagePublished(this, this.onMQTTPublishMessage);
        if (!this.host) {
            this.server.listen(this.port);
            logger_1.default.info(`Started frontend on port ${this.port}`);
        }
        else if (this.host.startsWith('/')) {
            this.server.listen(this.host);
            logger_1.default.info(`Started frontend on socket ${this.host}`);
        }
        else {
            this.server.listen(this.port, this.host);
            logger_1.default.info(`Started frontend on port ${this.host}:${this.port}`);
        }
    }
    async stop() {
        await super.stop();
        this.wss?.clients.forEach((client) => {
            client.send((0, json_stable_stringify_without_jsonify_1.default)({ topic: 'bridge/state', payload: 'offline' }));
            client.terminate();
        });
        this.wss?.close();
        /* istanbul ignore else */
        if (this.server) {
            return new Promise((cb) => this.server.close(cb));
        }
    }
    onRequest(request, response) {
        // @ts-ignore
        this.fileServer(request, response, (0, finalhandler_1.default)(request, response));
    }
    authenticate(request, cb) {
        const { query } = url_1.default.parse(request.url, true);
        cb(!this.authToken || this.authToken === query.token);
    }
    onUpgrade(request, socket, head) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.authenticate(request, (isAuthenticated) => {
                if (isAuthenticated) {
                    this.wss.emit('connection', ws, request);
                }
                else {
                    ws.close(4401, 'Unauthorized');
                }
            });
        });
    }
    onWebSocketConnection(ws) {
        ws.on('error', (msg) => logger_1.default.error(`WebSocket error: ${msg.message}`));
        ws.on('message', (data, isBinary) => {
            if (!isBinary && data) {
                const message = data.toString();
                const { topic, payload } = JSON.parse(message);
                this.mqtt.onMessage(`${this.mqttBaseTopic}/${topic}`, Buffer.from((0, json_stable_stringify_without_jsonify_1.default)(payload)));
            }
        });
        for (const [topic, payload] of Object.entries(this.mqtt.retainedMessages)) {
            /* istanbul ignore else */
            if (topic.startsWith(`${this.mqttBaseTopic}/`)) {
                ws.send((0, json_stable_stringify_without_jsonify_1.default)({
                    // Send topic without base_topic
                    topic: topic.substring(this.mqttBaseTopic.length + 1),
                    payload: utils_1.default.parseJSON(payload.payload, payload.payload),
                }));
            }
        }
        for (const device of this.zigbee.devicesIterator(utils_1.default.deviceNotCoordinator)) {
            const payload = this.state.get(device);
            const lastSeen = settings.get().advanced.last_seen;
            /* istanbul ignore if */
            if (lastSeen !== 'disable') {
                payload.last_seen = utils_1.default.formatDate(device.zh.lastSeen, lastSeen);
            }
            if (device.zh.linkquality !== undefined) {
                payload.linkquality = device.zh.linkquality;
            }
            ws.send((0, json_stable_stringify_without_jsonify_1.default)({ topic: device.name, payload }));
        }
    }
    onMQTTPublishMessage(data) {
        /* istanbul ignore else */
        if (data.topic.startsWith(`${this.mqttBaseTopic}/`)) {
            // Send topic without base_topic
            const topic = data.topic.substring(this.mqttBaseTopic.length + 1);
            const payload = utils_1.default.parseJSON(data.payload, data.payload);
            for (const client of this.wss.clients) {
                /* istanbul ignore else */
                if (client.readyState === ws_1.default.OPEN) {
                    client.send((0, json_stable_stringify_without_jsonify_1.default)({ topic, payload }));
                }
            }
        }
    }
}
exports.default = Frontend;
__decorate([
    bind_decorator_1.default
], Frontend.prototype, "onRequest", null);
__decorate([
    bind_decorator_1.default
], Frontend.prototype, "onUpgrade", null);
__decorate([
    bind_decorator_1.default
], Frontend.prototype, "onWebSocketConnection", null);
__decorate([
    bind_decorator_1.default
], Frontend.prototype, "onMQTTPublishMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnJvbnRlbmQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvZXh0ZW5zaW9uL2Zyb250ZW5kLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxvRUFBa0M7QUFDbEMsOEVBQStEO0FBQy9ELGdFQUF3QztBQUN4Qyw0Q0FBb0I7QUFDcEIsZ0RBQXdCO0FBQ3hCLGtEQUEwQjtBQUMxQixrSEFBOEQ7QUFFOUQsOENBQXNCO0FBQ3RCLDRDQUEyQjtBQUMzQixnRkFBNEM7QUFFNUMsNERBQW9DO0FBQ3BDLDJEQUE2QztBQUM3QywwREFBa0M7QUFDbEMsNERBQW9DO0FBRXBDOztHQUVHO0FBQ0gsTUFBcUIsUUFBUyxTQUFRLG1CQUFTO0lBQ25DLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztJQUMvQyxJQUFJLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7SUFDcEMsSUFBSSxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO0lBQ3BDLE9BQU8sR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztJQUMzQyxNQUFNLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7SUFDekMsU0FBUyxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO0lBQy9DLE1BQU0sQ0FBYztJQUM1Qiw4REFBOEQ7SUFDdEQsVUFBVSxDQUFpQjtJQUMzQixHQUFHLEdBQXFCLElBQUksQ0FBQztJQUU3QixpQkFBaUI7UUFDckIsSUFBSSxJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM5QixJQUFJLENBQUMsWUFB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