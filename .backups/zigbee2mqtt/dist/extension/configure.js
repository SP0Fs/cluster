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
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const zhc = __importStar(require("zigbee-herdsman-converters"));
const device_1 = __importDefault(require("../model/device"));
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
/**
 * This extension calls the zigbee-herdsman-converters definition configure() method
 */
class Configure extends extension_1.default {
    configuring = new Set();
    attempts = {};
    topic = `${settings.get().mqtt.base_topic}/bridge/request/device/configure`;
    legacyTopic = `${settings.get().mqtt.base_topic}/bridge/configure`;
    async onReconfigure(data) {
        // Disabling reporting unbinds some cluster which could be bound by configure, re-setup.
        if (data.device.zh.meta?.hasOwnProperty('configured')) {
            delete data.device.zh.meta.configured;
            data.device.zh.save();
        }
        await this.configure(data.device, 'reporting_disabled');
    }
    async onMQTTMessage(data) {
        if (data.topic === this.legacyTopic) {
            const device = this.zigbee.resolveEntity(data.message);
            if (!device || !(device instanceof device_1.default)) {
                logger_1.default.error(`Device '${data.message}' does not exist`);
                return;
            }
            if (!device.definition || !device.definition.configure) {
                logger_1.default.warning(`Skipping configure of '${device.name}', device does not require this.`);
                return;
            }
            await this.configure(device, 'mqtt_message', true);
        }
        else if (data.topic === this.topic) {
            const message = utils_1.default.parseJSON(data.message, data.message);
            const ID = typeof message === 'object' && message.hasOwnProperty('id') ? message.id : message;
            let error = null;
            const device = this.zigbee.resolveEntity(ID);
            if (!device || !(device instanceof device_1.default)) {
                error = `Device '${ID}' does not exist`;
            }
            else if (!device.definition || !device.definition.configure) {
                error = `Device '${device.name}' cannot be configured`;
            }
            else {
                try {
                    await this.configure(device, 'mqtt_message', true, true);
                }
                catch (e) {
                    error = `Failed to configure (${e.message})`;
                }
            }
            const response = utils_1.default.getResponse(message, { id: ID }, error);
            await this.mqtt.publish(`bridge/response/device/configure`, (0, json_stable_stringify_without_jsonify_1.default)(response));
        }
    }
    async start() {
        setImmediate(async () => {
            // Only configure routers on startup, end devices are likely sleeping and
            // will reconfigure once they send a message
            for (const device of this.zigbee.devicesIterator((d) => d.type === 'Router')) {
                // Sleep 10 seconds between configuring on startup to not DDoS the coordinator when many devices have to be configured.
                await utils_1.default.sleep(10);
                await this.configure(device, 'started');
            }
        });
        this.eventBus.onDeviceJoined(this, async (data) => {
            if (data.device.zh.meta.hasOwnProperty('configured')) {
                delete data.device.zh.meta.configured;
                data.device.zh.save();
            }
            await this.configure(data.device, 'zigbee_event');
        });
        this.eventBus.onDeviceInterview(this, (data) => this.configure(data.device, 'zigbee_event'));
        this.eventBus.onLastSeenChanged(this, (data) => this.configure(data.device, 'zigbee_event'));
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onReconfigure(this, this.onReconfigure);
    }
    async configure(device, event, force = false, throwError = false) {
        if (!force) {
            if (device.options.disabled || !device.definition?.configure || !device.zh.interviewCompleted) {
                return;
            }
            if (device.zh.meta?.hasOwnProperty('configured')) {
                return;
            }
            // Only configure end devices when it is active, otherwise it will likely fails as they are sleeping.
            if (device.zh.type === 'EndDevice' && event !== 'zigbee_event') {
                return;
            }
        }
        if (this.configuring.has(device.ieeeAddr) || (this.attempts[device.ieeeAddr] >= 3 && !force)) {
            return;
        }
        this.configuring.add(device.ieeeAddr);
        if (!this.attempts.hasOwnProperty(device.ieeeAddr)) {
            this.attempts[device.ieeeAddr] = 0;
        }
        logger_1.default.info(`Configuring '${device.name}'`);
        try {
            await device.definition.configure(device.zh, this.zigbee.firstCoordinatorEndpoint(), device.definition);
            logger_1.default.info(`Successfully configured '${device.name}'`);
            device.zh.meta.configured = zhc.getConfigureKey(device.definition);
            device.zh.save();
            this.eventBus.emitDevicesChanged();
        }
        catch (error) {
            this.attempts[device.ieeeAddr]++;
            const attempt = this.attempts[device.ieeeAddr];
            const msg = `Failed to configure '${device.name}', attempt ${attempt} (${error.stack})`;
            logger_1.default.error(msg);
            if (throwError) {
                throw error;
            }
        }
        finally {
            this.configuring.delete(device.ieeeAddr);
        }
    }
}
exports.default = Configure;
__decorate([
    bind_decorator_1.default
], Configure.prototype, "onReconfigure", null);
__decorate([
    bind_decorator_1.default
], Configure.prototype, "onMQTTMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9jb25maWd1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLG9FQUFrQztBQUNsQyxrSEFBOEQ7QUFDOUQsZ0VBQWtEO0FBRWxELDZEQUFxQztBQUNyQyw0REFBb0M7QUFDcEMsMkRBQTZDO0FBQzdDLDBEQUFrQztBQUNsQyw0REFBb0M7QUFFcEM7O0dBRUc7QUFDSCxNQUFxQixTQUFVLFNBQVEsbUJBQVM7SUFDcEMsV0FBVyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7SUFDeEIsUUFBUSxHQUEwQixFQUFFLENBQUM7SUFDckMsS0FBSyxHQUFHLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLGtDQUFrQyxDQUFDO0lBQzVFLFdBQVcsR0FBRyxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxtQkFBbUIsQ0FBQztJQUV2RCxBQUFOLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBMkI7UUFDekQsd0ZBQXdGO1FBQ3hGLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO1lBQ3BELE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztZQUN0QyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMxQixDQUFDO1FBRUQsTUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztJQUM1RCxDQUFDO0lBRW1CLEFBQU4sS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUEyQjtRQUN6RCxJQUFJLElBQUksQ0FBQyxLQUFL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