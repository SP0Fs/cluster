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
exports.Controller = void 0;
const assert_1 = __importDefault(require("assert"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const zigbee_herdsman_1 = require("zigbee-herdsman");
const zigbee_herdsman_converters_1 = require("zigbee-herdsman-converters");
const eventBus_1 = __importDefault(require("./eventBus"));
const availability_1 = __importDefault(require("./extension/availability"));
const bind_1 = __importDefault(require("./extension/bind"));
const bridge_1 = __importDefault(require("./extension/bridge"));
const configure_1 = __importDefault(require("./extension/configure"));
const externalConverters_1 = __importDefault(require("./extension/externalConverters"));
const externalExtension_1 = __importDefault(require("./extension/externalExtension"));
// Extensions
const frontend_1 = __importDefault(require("./extension/frontend"));
const groups_1 = __importDefault(require("./extension/groups"));
const homeassistant_1 = __importDefault(require("./extension/homeassistant"));
const bridgeLegacy_1 = __importDefault(require("./extension/legacy/bridgeLegacy"));
const deviceGroupMembership_1 = __importDefault(require("./extension/legacy/deviceGroupMembership"));
const report_1 = __importDefault(require("./extension/legacy/report"));
const softReset_1 = __importDefault(require("./extension/legacy/softReset"));
const networkMap_1 = __importDefault(require("./extension/networkMap"));
const onEvent_1 = __importDefault(require("./extension/onEvent"));
const otaUpdate_1 = __importDefault(require("./extension/otaUpdate"));
const publish_1 = __importDefault(require("./extension/publish"));
const receive_1 = __importDefault(require("./extension/receive"));
const mqtt_1 = __importDefault(require("./mqtt"));
const state_1 = __importDefault(require("./state"));
const logger_1 = __importDefault(require("./util/logger"));
const settings = __importStar(require("./util/settings"));
const utils_1 = __importDefault(require("./util/utils"));
const zigbee_1 = __importDefault(require("./zigbee"));
const AllExtensions = [
    publish_1.default,
    receive_1.default,
    networkMap_1.default,
    softReset_1.default,
    homeassistant_1.default,
    configure_1.default,
    deviceGroupMembership_1.default,
    bridgeLegacy_1.default,
    bridge_1.default,
    groups_1.default,
    bind_1.default,
    report_1.default,
    onEvent_1.default,
    otaUpdate_1.default,
    externalConverters_1.default,
    frontend_1.default,
    externalExtension_1.default,
    availability_1.default,
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdNotify = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdNotify = process.env.NOTIFY_SOCKET ? require('sd-notify') : null;
}
catch {
    // sd-notify is optional
}
class Controller {
    eventBus;
    zigbee;
    state;
    mqtt;
    restartCallback;
    exitCallback;
    extensions;
    extensionArgs;
    constructor(restartCallback, exitCallback) {
        logger_1.default.init();
        (0, zigbee_herdsman_1.setLogger)(logger_1.default);
        (0, zigbee_herdsman_converters_1.setLogger)(logger_1.default);
        this.eventBus = new eventBus_1.default();
        this.zigbee = new zigbee_1.default(this.eventBus);
        this.mqtt = new mqtt_1.default(this.eventBus);
        this.state = new state_1.default(this.eventBus, this.zigbee);
        this.restartCallback = restartCallback;
        this.exitCallback = exitCallback;
        // Initialize extensions.
        this.extensionArgs = [
            this.zigbee,
            this.mqtt,
            this.state,
            this.publishEntityState,
            this.eventBus,
            this.enableDisableExtension,
            this.restartCallback,
            this.addExtension,
        ];
        this.extensions = [
            new onEvent_1.default(...this.extensionArgs),
            new bridge_1.default(...this.extensionArgs),
            new publish_1.default(...this.extensionArgs),
            new receive_1.default(...this.extensionArgs),
            new deviceGroupMembership_1.default(...this.extensionArgs),
            new configure_1.default(...this.extensionArgs),
            new networkMap_1.default(...this.extensionArgs),
            new groups_1.default(...this.extensionArgs),
            new bind_1.default(...this.extensionArgs),
            new otaUpdate_1.default(...this.extensionArgs),
            new report_1.default(...this.extensionArgs),
            new externalExtension_1.default(...this.extensionArgs),
            new availability_1.default(...this.extensionArgs),
            settings.get().frontend && new frontend_1.default(...this.extensionArgs),
            settings.get().advanced.legacy_api && new bridgeLegacy_1.default(...this.extensionArgs),
            settings.get().external_converters.length && new externalConverters_1.default(...this.extensionArgs),
            settings.get().homeassistant && new homeassistant_1.default(...this.extensionArgs),
            /* istanbul ignore next */
            settings.get().advanced.soft_reset_timeout !== 0 && new softReset_1.default(...this.extensionArgs),
        ].filter((n) => n);
    }
    async start() {
        this.state.start();
        const info = await utils_1.default.getZigbee2MQTTVersion();
        logger_1.default.info(`Starting Zigbee2MQTT version ${info.version} (commit #${info.commitHash})`);
        // Start zigbee
        let startResult;
        try {
            startResult = await this.zigbee.start();
            this.eventBus.onAdapterDisconnected(this, this.onZigbeeAdapterDisconnected);
        }
        catch (error) {
            logger_1.default.error('Failed to start zigbee');
            logger_1.default.error('Check https://www.zigbee2mqtt.io/guide/installation/20_zigbee2mqtt-fails-to-start.html for possible solutions');
            logger_1.default.error('Exiting...');
            logger_1.default.error(error.stack);
            return this.exit(1);
        }
        // Disable some legacy options on new network creation
        if (startResult === 'reset') {
            settings.set(['advanced', 'homeassistant_legacy_entity_attributes'], false);
            settings.set(['advanced', 'legacy_api'], false);
            settings.set(['advanced', 'legacy_availability_payload'], false);
            settings.set(['device_options', 'legacy'], false);
            await this.enableDisableExtension(false, 'BridgeLegacy');
        }
        // Log zigbee clients on startup
        let deviceCount = 0;
        for (const device of this.zigbee.devicesIterator(utils_1.default.deviceNotCoordinator)) {
            const model = device.isSupported
                ? `${device.definition.model} - ${device.definition.vendor} ${device.definition.description}`
                : 'Not supported';
            logger_1.default.info(`${device.name} (${device.ieeeAddr}): ${model} (${device.zh.type})`);
            deviceCount++;
        }
        logger_1.default.info(`Currently ${deviceCount} devices are joined.`);
        // Enable zigbee join
        try {
            if (settings.get().permit_join) {
                logger_1.default.warning('`permit_join` set to  `true` in configuration.yaml.');
                logger_1.default.warning('Allowing new devices to join.');
                logger_1.default.warning('Set `permit_join` to `false` once you joined all devices.');
            }
            await this.zigbee.permitJoin(settings.get().permit_join);
        }
        catch (error) {
            logger_1.default.error(`Failed to set permit join to ${settings.get().permit_join} (${error.message})`);
        }
        // MQTT
        try {
            await this.mqtt.connect();
        }
        catch (error) {
            logger_1.default.error(`MQTT failed to connect, exiting... (${error.message})`);
            await this.zigbee.stop();
            return this.exit(1);
        }
        // Call extensions
        await this.callExtensions('start', [...this.extensions]);
        // Send all cached states.
        if (settings.get().advanced.cache_state_send_on_startup && settings.get().advanced.cache_state) {
            for (const entity of this.zigbee.devicesAndGroupsIterator()) {
                if (this.state.exists(entity)) {
                    await this.publishEntityState(entity, this.state.get(entity), 'publishCached');
                }
            }
        }
        this.eventBus.onLastSeenChanged(this, (data) => utils_1.default.publishLastSeen(data, settings.get(), false, this.publishEntityState));
        logger_1.default.info(`Zigbee2MQTT started!`);
        const watchdogInterval = sdNotify?.watchdogInterval() || 0;
        if (watchdogInterval > 0) {
            sdNotify.startWatchdogMode(Math.floor(watchdogInterval / 2));
        }
        sdNotify?.ready();
    }
    async enableDisableExtension(enable, name) {
        if (!enable) {
            const extension = this.extensions.find((e) => e.constructor.name === name);
            if (extension) {
                await this.callExtensions('stop', [extension]);
                this.extensions.splice(this.extensions.indexOf(extension), 1);
            }
        }
        else {
            const Extension = AllExtensions.find((e) => e.name === name);
            (0, assert_1.default)(Extension, `Extension '${name}' does not exist`);
            const extension = new Extension(...this.extensionArgs);
            this.extensions.push(extension);
            await this.callExtensions('start', [extension]);
        }
    }
    async addExtension(extension) {
        this.extensions.push(extension);
        await this.callExtensions('start', [extension]);
    }
    async stop(restart = false) {
        sdNotify?.stopping();
        // Call extensions
        await this.callExtensions('stop', this.extensions);
        this.eventBus.removeListeners(this);
        // Wrap-up
        this.state.stop();
        await this.mqtt.disconnect();
        let code = 0;
        try {
            await this.zigbee.stop();
            logger_1.default.info('Stopped Zigbee2MQTT');
        }
        catch (error) {
            logger_1.default.error(`Failed to stop Zigbee2MQTT (${error.message})`);
            code = 1;
        }
        sdNotify?.stopWatchdogMode();
        return this.exit(code, restart);
    }
    async exit(code, restart = false) {
        await logger_1.default.end();
        return this.exitCallback(code, restart);
    }
    async onZigbeeAdapterDisconnected() {
        logger_1.default.error('Adapter disconnected, stopping');
        await this.stop();
    }
    async publishEntityState(entity, payload, stateChangeReason) {
        let message = { ...payload };
        // Update state cache with new state.
        const newState = this.state.set(entity, payload, stateChangeReason);
        if (settings.get().advanced.cache_state) {
            // Add cached state to payload
            message = newState;
        }
        const options = {
            retain: utils_1.default.getObjectProperty(entity.options, 'retain', false),
            qos: utils_1.default.getObjectProperty(entity.options, 'qos', 0),
        };
        const retention = utils_1.default.getObjectProperty(entity.options, 'retention', false);
        if (retention !== false) {
            options.properties = { messageExpiryInterval: retention };
        }
        if (entity.isDevice() && settings.get().mqtt.include_device_information) {
            message.device = {
                friendlyName: entity.name,
                model: entity.definition?.model,
                ieeeAddr: entity.ieeeAddr,
                networkAddress: entity.zh.networkAddress,
                type: entity.zh.type,
                manufacturerID: entity.zh.manufacturerID,
                powerSource: entity.zh.powerSource,
                applicationVersion: entity.zh.applicationVersion,
                stackVersion: entity.zh.stackVersion,
                zclVersion: entity.zh.zclVersion,
                hardwareVersion: entity.zh.hardwareVersion,
                dateCode: entity.zh.dateCode,
                softwareBuildID: entity.zh.softwareBuildID,
                // Manufacturer name can contain \u0000, remove this.
                // https://github.com/home-assistant/core/issues/85691
                manufacturerName: entity.zh.manufacturerName?.split('\u0000')[0],
            };
        }
        // Add lastseen
        const lastSeen = settings.get().advanced.last_seen;
        if (entity.isDevice() && lastSeen !== 'disable' && entity.zh.lastSeen) {
            message.last_seen = utils_1.default.formatDate(entity.zh.lastSeen, lastSeen);
        }
        // Add device linkquality.
        if (entity.isDevice() && entity.zh.linkquality !== undefined) {
            message.linkquality = entity.zh.linkquality;
        }
        for (const extension of this.extensions) {
            extension.adjustMessageBeforePublish?.(entity, message);
        }
        // Filter mqtt message attributes
        utils_1.default.filterProperties(entity.options.filtered_attributes, message);
        if (Object.entries(message).length) {
            const output = settings.get().advanced.output;
            if (output === 'attribute_and_json' || output === 'json') {
                await this.mqtt.publish(entity.name, (0, json_stable_stringify_without_jsonify_1.default)(message), options);
            }
            if (output === 'attribute_and_json' || output === 'attribute') {
                await this.iteratePayloadAttributeOutput(`${entity.name}/`, message, options);
            }
        }
        this.eventBus.emitPublishEntityState({ entity, message, stateChangeReason, payload });
    }
    async iteratePayloadAttributeOutput(topicRoot, payload, options) {
        for (const [key, value] of Object.entries(payload)) {
            let subPayload = value;
            let message = null;
            // Special cases
            if (key === 'color' && utils_1.default.objectHasProperties(subPayload, ['r', 'g', 'b'])) {
                subPayload = [subPayload.r, subPayload.g, subPayload.b];
            }
            // Check Array first, since it is also an Object
            if (subPayload === null || subPayload === undefined) {
                message = '';
            }
            else if (Array.isArray(subPayload)) {
                message = subPayload.map((x) => `${x}`).join(',');
            }
            else if (typeof subPayload === 'object') {
                await this.iteratePayloadAttributeOutput(`${topicRoot}${key}-`, subPayload, options);
            }
            else {
                message = typeof subPayload === 'string' ? subPayload : (0, json_stable_stringify_without_jsonify_1.default)(subPayload);
            }
            if (message !== null) {
                await this.mqtt.publish(`${topicRoot}${key}`, message, options);
            }
        }
    }
    async callExtensions(method, extensions) {
        for (const extension of extensions) {
            try {
                await extension[method]?.();
            }
            catch (error) {
                /* istanbul ignore next */
                logger_1.default.error(`Failed to call '${extension.constructor.name}' '${method}' (${error.stack})`);
            }
        }
    }
}
exports.Controller = Controller;
__decorate([
    bind_decorator_1.default
], Controller.prototype, "enableDisableExtension", null);
__decorate([
    bind_decorator_1.default
], Controller.prototype, "addExtension", null);
__decorate([
    bind_decorator_1.default
], Controller.prototype, "onZigbeeAdapterDisconnected", null);
__decorate([
    bind_decorator_1.default
], Controller.prototype, "publishEntityState", null);
module.exports = Controller;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJvbGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL2xpYi9jb250cm9sbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsb0RBQTRCO0FBQzVCLG9FQUFrQztBQUNsQyxrSEFBOEQ7QUFDOUQscURBQXlEO0FBQ3pELDJFQUFxRTtBQUVyRSwwREFBa0M7QUFDbEMsNEVBQTZEO0FBQzdELDREQUE2QztBQUM3QyxnRUFBaUQ7QUFDakQsc0VBQXVEO0FBQ3ZELHdGQUF5RTtBQUN6RSxzRkFBdUU7QUFDdkUsYUFBYTtBQUNiLG9FQUFxRDtBQUNyRCxnRUFBaUQ7QUFDakQsOEVBQStEO0FBQy9ELG1GQUFvRTtBQUNwRSxxR0FBc0Y7QUFDdEYsdUVBQXdEO0FBQ3hELDZFQUE4RDtBQUM5RCx3RUFBeUQ7QUFDekQsa0VBQW1EO0FBQ25ELHNFQUF1RDtBQUN2RCxrRUFBbUQ7QUFDbkQsa0VBQW1EO0FBQ25ELGtEQUEwQjtBQUMxQixvREFBNEI7QUFDNUIsMkRBQW1DO0FBQ25DLDBEQUE0QztBQUM1Qyx5REFBaUM7QUFDakMsc0RBQThCO0FBRTlCLE1BQU0sYUFBYSxHQUFHO0lBQ2xCLGlCQUFnQjtJQUNoQixpQkFBZ0I7SUFDaEIsb0JBQW1CO0lBQ25CLG1CQUFrQjtJQUNsQix1QkFBc0I7SUFDdEIsbUJBQWtCO0lBQ2xCLCtCQUE4QjtJQUM5QixzQkFBcUI7SUFDckIsZ0JBQWU7SUFDZixnQkFBZTtJQUNmLGNBQWE7SUFDYixnQkFBZTtJQUNmLGlCQUFnQjtJQUNoQixtQkFBa0I7SUFDbEIsNEJBQTJCO0lBQzNCLGtCQUFpQjtJQUNqQiwyQkFBMEI7SUFDMUIsc0JBQXFCO0NBQ3hCLENBQUM7QUFhRiw4REFBOEQ7QUFDOUQsSUFBSSxRQUFRLEdBQVEsSUFBSSxDQUFDO0FBQ3pCLElBQUksQ0FBQztJQUNELGlFQUFpRTtJQUNqRSxRQUFRLEdBQUcsT0FBTyxDQUFDLEdB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