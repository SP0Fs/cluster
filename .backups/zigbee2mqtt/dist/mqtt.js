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
const fs_1 = __importDefault(require("fs"));
const mqtt = __importStar(require("mqtt"));
const logger_1 = __importDefault(require("./util/logger"));
const settings = __importStar(require("./util/settings"));
const utils_1 = __importDefault(require("./util/utils"));
const NS = 'z2m:mqtt';
class MQTT {
    publishedTopics = new Set();
    connectionTimer;
    client;
    eventBus;
    initialConnect = true;
    republishRetainedTimer;
    retainedMessages = {};
    constructor(eventBus) {
        this.eventBus = eventBus;
    }
    async connect() {
        const mqttSettings = settings.get().mqtt;
        logger_1.default.info(`Connecting to MQTT server at ${mqttSettings.server}`);
        const options = {
            will: {
                topic: `${settings.get().mqtt.base_topic}/bridge/state`,
                payload: Buffer.from(utils_1.default.availabilityPayload('offline', settings.get())),
                retain: settings.get().mqtt.force_disable_retain ? false : true,
                qos: 1,
            },
        };
        if (mqttSettings.version) {
            options.protocolVersion = mqttSettings.version;
        }
        if (mqttSettings.keepalive) {
            logger_1.default.debug(`Using MQTT keepalive: ${mqttSettings.keepalive}`);
            options.keepalive = mqttSettings.keepalive;
        }
        if (mqttSettings.ca) {
            logger_1.default.debug(`MQTT SSL/TLS: Path to CA certificate = ${mqttSettings.ca}`);
            options.ca = fs_1.default.readFileSync(mqttSettings.ca);
        }
        if (mqttSettings.key && mqttSettings.cert) {
            logger_1.default.debug(`MQTT SSL/TLS: Path to client key = ${mqttSettings.key}`);
            logger_1.default.debug(`MQTT SSL/TLS: Path to client certificate = ${mqttSettings.cert}`);
            options.key = fs_1.default.readFileSync(mqttSettings.key);
            options.cert = fs_1.default.readFileSync(mqttSettings.cert);
        }
        if (mqttSettings.user && mqttSettings.password) {
            logger_1.default.debug(`Using MQTT login with username: ${mqttSettings.user}`);
            options.username = mqttSettings.user;
            options.password = mqttSettings.password;
        }
        else {
            logger_1.default.debug(`Using MQTT anonymous login`);
        }
        if (mqttSettings.client_id) {
            logger_1.default.debug(`Using MQTT client ID: '${mqttSettings.client_id}'`);
            options.clientId = mqttSettings.client_id;
        }
        if (mqttSettings.hasOwnProperty('reject_unauthorized') && !mqttSettings.reject_unauthorized) {
            logger_1.default.debug(`MQTT reject_unauthorized set false, ignoring certificate warnings.`);
            options.rejectUnauthorized = false;
        }
        return new Promise((resolve, reject) => {
            this.client = mqtt.connect(mqttSettings.server, options);
            // @ts-ignore https://github.com/Koenkk/zigbee2mqtt/issues/9822
            this.client.stream.setMaxListeners(0);
            this.eventBus.onPublishAvailability(this, this.publishStateOnline);
            this.client.on('connect', async () => {
                // Set timer at interval to check if connected to MQTT server.
                clearTimeout(this.connectionTimer);
                this.connectionTimer = setInterval(() => {
                    if (this.client.reconnecting) {
                        logger_1.default.error('Not connected to MQTT server!');
                    }
                }, utils_1.default.seconds(10));
                logger_1.default.info('Connected to MQTT server');
                await this.publishStateOnline();
                if (!this.initialConnect) {
                    this.republishRetainedTimer = setTimeout(async () => {
                        // Republish retained messages in case MQTT broker does not persist them.
                        // https://github.com/Koenkk/zigbee2mqtt/issues/9629
                        for (const msg of Object.values(this.retainedMessages)) {
                            await this.publish(msg.topic, msg.payload, msg.options, msg.base, msg.skipLog, msg.skipReceive);
                        }
                    }, 2000);
                }
                this.initialConnect = false;
                this.subscribe(`${settings.get().mqtt.base_topic}/#`);
                resolve();
            });
            this.client.on('error', (err) => {
                logger_1.default.error(`MQTT error: ${err.message}`);
                reject(err);
            });
            this.client.on('message', this.onMessage);
        });
    }
    async publishStateOnline() {
        await this.publish('bridge/state', utils_1.default.availabilityPayload('online', settings.get()), { retain: true, qos: 0 });
    }
    async disconnect() {
        clearTimeout(this.connectionTimer);
        await this.publish('bridge/state', utils_1.default.availabilityPayload('offline', settings.get()), { retain: true, qos: 0 });
        this.eventBus.removeListeners(this);
        logger_1.default.info('Disconnecting from MQTT server');
        this.client?.end();
    }
    subscribe(topic) {
        this.client.subscribe(topic);
    }
    unsubscribe(topic) {
        this.client.unsubscribe(topic);
    }
    onMessage(topic, message) {
        // Since we subscribe to zigbee2mqtt/# we also receive the message we send ourselves, skip these.
        if (!this.publishedTopics.has(topic)) {
            logger_1.default.debug(`Received MQTT message on '${topic}' with data '${message.toString()}'`, NS);
            this.eventBus.emitMQTTMessage({ topic, message: message.toString() });
        }
        if (this.republishRetainedTimer && topic === `${settings.get().mqtt.base_topic}/bridge/info`) {
            clearTimeout(this.republishRetainedTimer);
            this.republishRetainedTimer = null;
        }
    }
    isConnected() {
        return this.client && !this.client.reconnecting;
    }
    async publish(topic, payload, options = {}, base = settings.get().mqtt.base_topic, skipLog = false, skipReceive = true) {
        const defaultOptions = { qos: 0, retain: false };
        topic = `${base}/${topic}`;
        if (skipReceive) {
            this.publishedTopics.add(topic);
        }
        if (options.retain) {
            if (payload) {
                this.retainedMessages[topic] = { payload, options, skipReceive, skipLog, topic: topic.substring(base.length + 1), base };
            }
            else {
                delete this.retainedMessages[topic];
            }
        }
        this.eventBus.emitMQTTMessagePublished({ topic, payload, options: { ...defaultOptions, ...options } });
        if (!this.isConnected()) {
            /* istanbul ignore else */
            if (!skipLog) {
                logger_1.default.error(`Not connected to MQTT server!`);
                logger_1.default.error(`Cannot send message: topic: '${topic}', payload: '${payload}`);
            }
            return;
        }
        if (!skipLog) {
            logger_1.default.info(`MQTT publish: topic '${topic}', payload '${payload}'`, NS);
        }
        const actualOptions = { ...defaultOptions, ...options };
        if (settings.get().mqtt.force_disable_retain) {
            actualOptions.retain = false;
        }
        return new Promise((resolve) => {
            this.client.publish(topic, payload, actualOptions, () => resolve());
        });
    }
}
exports.default = MQTT;
__decorate([
    bind_decorator_1.default
], MQTT.prototype, "publishStateOnline", null);
__decorate([
    bind_decorator_1.default
], MQTT.prototype, "onMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXF0dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL2xpYi9tcXR0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxvRUFBa0M7QUFDbEMsNENBQW9CO0FBQ3BCLDJDQUE2QjtBQUU3QiwyREFBbUM7QUFDbkMsMERBQTRDO0FBQzVDLHlEQUFpQztBQUVqQyxNQUFNLEVBQUUsR0FBRyxVQUFVLENBQUM7QUFFdEIsTUFBcUIsSUFBSTtJQUNiLGVBQWUsR0FBZ0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUN6QyxlQUFlLENBQWlCO0lBQ2hDLE1BQU0sQ0FBa0I7SUFDeEIsUUFBUSxDQUFXO0lBQ25CLGNBQWMsR0FBRyxJQUFJLENBQUM7SUFDdEIsc0JBQXNCLENBQWlCO0lBQ3hDLGdCQUFnQixHQUVuQixFQUFFLENBQUM7SUFFUCxZQUFZLFFBQWtCO1FBQzFCLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO0lBQzdCLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTztRQUNULE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUM7UUFFekMsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBRW5FLE1BQU0sT0FBTyxHQUF3QjtZQUNqQyxJQUFJLEVBQUU7Z0JBQ0YsS0FBSyxFQUFFLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLGVBQWU7Z0JBQ3ZELE9BQU8sRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQUssQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBQzFFLE1BQU0sRUFBRSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxLQUFL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