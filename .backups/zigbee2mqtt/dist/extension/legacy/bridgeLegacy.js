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
const assert_1 = __importDefault(require("assert"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const logger_1 = __importDefault(require("../../util/logger"));
const settings = __importStar(require("../../util/settings"));
const utils_1 = __importDefault(require("../../util/utils"));
const extension_1 = __importDefault(require("../extension"));
const configRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/config/((?:\\w+/get)|(?:\\w+/factory_reset)|(?:\\w+))`);
class BridgeLegacy extends extension_1.default {
    lastJoinedDeviceName = null;
    supportedOptions;
    async start() {
        this.supportedOptions = {
            permit_join: this.permitJoin,
            last_seen: this.lastSeen,
            elapsed: this.elapsed,
            reset: this.reset,
            log_level: this.logLevel,
            devices: this.devices,
            groups: this.groups,
            'devices/get': this.devices,
            rename: this.rename,
            rename_last: this.renameLast,
            remove: this.remove,
            force_remove: this.forceRemove,
            ban: this.ban,
            device_options: this.deviceOptions,
            add_group: this.addGroup,
            remove_group: this.removeGroup,
            force_remove_group: this.removeGroup,
            whitelist: this.whitelist,
            'touchlink/factory_reset': this.touchlinkFactoryReset,
        };
        this.eventBus.onDeviceJoined(this, (data) => this.onZigbeeEvent_('deviceJoined', data, data.device));
        this.eventBus.onDeviceInterview(this, (data) => this.onZigbeeEvent_('deviceInterview', data, data.device));
        this.eventBus.onDeviceAnnounce(this, (data) => this.onZigbeeEvent_('deviceAnnounce', data, data.device));
        this.eventBus.onDeviceLeave(this, (data) => this.onZigbeeEvent_('deviceLeave', data, null));
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        await this.publish();
    }
    async whitelist(topic, message) {
        try {
            const entity = settings.getDevice(message);
            (0, assert_1.default)(entity, `Entity '${message}' does not exist`);
            settings.addDeviceToPasslist(entity.ID.toString());
            logger_1.default.info(`Whitelisted '${entity.friendly_name}'`);
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: 'device_whitelisted', message: { friendly_name: entity.friendly_name } }));
        }
        catch (error) {
            logger_1.default.error(`Failed to whitelist '${message}' '${error}'`);
        }
    }
    deviceOptions(topic, message) {
        let json = null;
        try {
            json = JSON.parse(message);
        }
        catch {
            logger_1.default.error('Failed to parse message as JSON');
            return;
        }
        if (!json.hasOwnProperty('friendly_name') || !json.hasOwnProperty('options')) {
            logger_1.default.error('Invalid JSON message, should contain "friendly_name" and "options"');
            return;
        }
        const entity = settings.getDevice(json.friendly_name);
        (0, assert_1.default)(entity, `Entity '${json.friendly_name}' does not exist`);
        settings.changeEntityOptions(entity.ID.toString(), json.options);
        logger_1.default.info(`Changed device specific options of '${json.friendly_name}' (${(0, json_stable_stringify_without_jsonify_1.default)(json.options)})`);
    }
    async permitJoin(topic, message) {
        await this.zigbee.permitJoin(message.toLowerCase() === 'true');
        await this.publish();
    }
    async reset() {
        try {
            await this.zigbee.reset('soft');
            logger_1.default.info('Soft reset ZNP');
        }
        catch {
            logger_1.default.error('Soft reset failed');
        }
    }
    lastSeen(topic, message) {
        const allowed = ['disable', 'ISO_8601', 'epoch', 'ISO_8601_local'];
        if (!allowed.includes(message)) {
            logger_1.default.error(`${message} is not an allowed value, possible: ${allowed}`);
            return;
        }
        settings.set(['advanced', 'last_seen'], message);
        logger_1.default.info(`Set last_seen to ${message}`);
    }
    elapsed(topic, message) {
        const allowed = ['true', 'false'];
        if (!allowed.includes(message)) {
            logger_1.default.error(`${message} is not an allowed value, possible: ${allowed}`);
            return;
        }
        settings.set(['advanced', 'elapsed'], message === 'true');
        logger_1.default.info(`Set elapsed to ${message}`);
    }
    async logLevel(topic, message) {
        const level = message.toLowerCase();
        if (settings.LOG_LEVELS.includes(level)) {
            logger_1.default.info(`Switching log level to '${level}'`);
            logger_1.default.setLevel(level);
        }
        else {
            logger_1.default.error(`Could not set log level to '${level}'. Allowed level: '${settings.LOG_LEVELS.join(',')}'`);
        }
        await this.publish();
    }
    async devices(topic) {
        const coordinator = await this.zigbee.getCoordinatorVersion();
        const devices = [];
        for (const device of this.zigbee.devicesIterator()) {
            const payload = {
                ieeeAddr: device.ieeeAddr,
                type: device.zh.type,
                networkAddress: device.zh.networkAddress,
            };
            if (device.zh.type !== 'Coordinator') {
                const definition = device.definition;
                payload.model = definition ? definition.model : device.zh.modelID;
                payload.vendor = definition ? definition.vendor : '-';
                payload.description = definition ? definition.description : '-';
                payload.friendly_name = device.name;
                payload.manufacturerID = device.zh.manufacturerID;
                payload.manufacturerName = device.zh.manufacturerName;
                payload.powerSource = device.zh.powerSource;
                payload.modelID = device.zh.modelID;
                payload.hardwareVersion = device.zh.hardwareVersion;
                payload.softwareBuildID = device.zh.softwareBuildID;
                payload.dateCode = device.zh.dateCode;
                payload.lastSeen = device.zh.lastSeen;
            }
            else {
                payload.friendly_name = 'Coordinator';
                payload.softwareBuildID = coordinator.type;
                payload.dateCode = coordinator.meta.revision.toString();
                payload.lastSeen = Date.now();
            }
            devices.push(payload);
        }
        if (topic.split('/').pop() == 'get') {
            await this.mqtt.publish(`bridge/config/devices`, (0, json_stable_stringify_without_jsonify_1.default)(devices), {}, settings.get().mqtt.base_topic, false, false);
        }
        else {
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: 'devices', message: devices }));
        }
    }
    async groups() {
        const payload = settings.getGroups().map((g) => {
            return { ...g, ID: Number(g.ID) };
        });
        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: 'groups', message: payload }));
    }
    async rename(topic, message) {
        const invalid = `Invalid rename message format expected {"old": "friendly_name", "new": "new_name"} got ${message}`;
        let json = null;
        try {
            json = JSON.parse(message);
        }
        catch {
            logger_1.default.error(invalid);
            return;
        }
        // Validate message
        if (!json.new || !json.old) {
            logger_1.default.error(invalid);
            return;
        }
        await this._renameInternal(json.old, json.new);
    }
    async renameLast(topic, message) {
        if (!this.lastJoinedDeviceName) {
            logger_1.default.error(`Cannot rename last joined device, no device has joined during this session`);
            return;
        }
        await this._renameInternal(this.lastJoinedDeviceName, message);
    }
    async _renameInternal(from, to) {
        try {
            const isGroup = settings.getGroup(from) !== null;
            settings.changeFriendlyName(from, to);
            logger_1.default.info(`Successfully renamed - ${from} to ${to} `);
            const entity = this.zigbee.resolveEntity(to);
            if (entity.isDevice()) {
                this.eventBus.emitEntityRenamed({ homeAssisantRename: false, from, to, entity });
            }
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `${isGroup ? 'group' : 'device'}_renamed`, message: { from, to } }));
        }
        catch {
            logger_1.default.error(`Failed to rename - ${from} to ${to}`);
        }
    }
    async addGroup(topic, message) {
        let id = null;
        let name = null;
        try {
            // json payload with id and friendly_name
            const json = JSON.parse(message);
            if (json.hasOwnProperty('id')) {
                id = json.id;
                name = `group_${id}`;
            }
            if (json.hasOwnProperty('friendly_name')) {
                name = json.friendly_name;
            }
        }
        catch {
            // just friendly_name
            name = message;
        }
        if (name == null) {
            logger_1.default.error('Failed to add group, missing friendly_name!');
            return;
        }
        const group = settings.addGroup(name, id);
        this.zigbee.createGroup(group.ID);
        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `group_added`, message: name }));
        logger_1.default.info(`Added group '${name}'`);
    }
    async removeGroup(topic, message) {
        const name = message;
        const entity = this.zigbee.resolveEntity(message);
        (0, assert_1.default)(entity && entity.isGroup(), `Group '${message}' does not exist`);
        if (topic.includes('force')) {
            entity.zh.removeFromDatabase();
        }
        else {
            await entity.zh.removeFromNetwork();
        }
        settings.removeGroup(message);
        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `group_removed`, message }));
        logger_1.default.info(`Removed group '${name}'`);
    }
    async forceRemove(topic, message) {
        await this.removeForceRemoveOrBan('force_remove', message);
    }
    async remove(topic, message) {
        await this.removeForceRemoveOrBan('remove', message);
    }
    async ban(topic, message) {
        await this.removeForceRemoveOrBan('ban', message);
    }
    async removeForceRemoveOrBan(action, message) {
        const entity = this.zigbee.resolveEntity(message.trim());
        const lookup = {
            ban: ['banned', 'Banning', 'ban'],
            force_remove: ['force_removed', 'Force removing', 'force remove'],
            remove: ['removed', 'Removing', 'remove'],
        };
        if (!entity) {
            logger_1.default.error(`Cannot ${lookup[action][2]}, device '${message}' does not exist`);
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${lookup[action][0]}_failed`, message }));
            return;
        }
        const ieeeAddr = entity.ieeeAddr;
        const name = entity.name;
        const cleanup = async () => {
            // Fire event
            this.eventBus.emitEntityRemoved({ id: ieeeAddr, name: name, type: 'device' });
            // Remove from configuration.yaml
            settings.removeDevice(entity.ieeeAddr);
            // Remove from state
            this.state.remove(ieeeAddr);
            logger_1.default.info(`Successfully ${lookup[action][0]} ${entity.name}`);
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${lookup[action][0]}`, message }));
        };
        try {
            logger_1.default.info(`${lookup[action][1]} '${entity.name}'`);
            if (action === 'force_remove') {
                entity.zh.removeFromDatabase();
            }
            else {
                await entity.zh.removeFromNetwork();
            }
            await cleanup();
        }
        catch (error) {
            logger_1.default.error(`Failed to ${lookup[action][2]} ${entity.name} (${error})`);
            // eslint-disable-next-line
            logger_1.default.error(`See https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html#zigbee2mqtt-bridge-request for more info`);
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${lookup[action][0]}_failed`, message }));
        }
        if (action === 'ban') {
            settings.blockDevice(ieeeAddr);
        }
    }
    async onMQTTMessage(data) {
        const { topic, message } = data;
        if (!topic.match(configRegex)) {
            return;
        }
        const option = topic.match(configRegex)[1];
        if (!this.supportedOptions.hasOwnProperty(option)) {
            return;
        }
        await this.supportedOptions[option](topic, message);
        return;
    }
    async publish() {
        const info = await utils_1.default.getZigbee2MQTTVersion();
        const coordinator = await this.zigbee.getCoordinatorVersion();
        const topic = `bridge/config`;
        const payload = {
            version: info.version,
            commit: info.commitHash,
            coordinator,
            network: await this.zigbee.getNetworkParameters(),
            log_level: logger_1.default.getLevel(),
            permit_join: this.zigbee.getPermitJoin(),
        };
        await this.mqtt.publish(topic, (0, json_stable_stringify_without_jsonify_1.default)(payload), { retain: true, qos: 0 });
    }
    async onZigbeeEvent_(type, data, resolvedEntity) {
        if (type === 'deviceJoined' && resolvedEntity) {
            this.lastJoinedDeviceName = resolvedEntity.name;
        }
        if (type === 'deviceJoined') {
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_connected`, message: { friendly_name: resolvedEntity.name } }));
        }
        else if (type === 'deviceInterview') {
            if (data.status === 'successful') {
                if (resolvedEntity.isSupported) {
                    const { vendor, description, model } = resolvedEntity.definition;
                    const log = { friendly_name: resolvedEntity.name, model, vendor, description, supported: true };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `pairing`, message: 'interview_successful', meta: log }));
                }
                else {
                    const meta = { friendly_name: resolvedEntity.name, supported: false };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `pairing`, message: 'interview_successful', meta }));
                }
            }
            else if (data.status === 'failed') {
                const meta = { friendly_name: resolvedEntity.name };
                await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `pairing`, message: 'interview_failed', meta }));
            }
            else {
                /* istanbul ignore else */
                if (data.status === 'started') {
                    const meta = { friendly_name: resolvedEntity.name };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `pairing`, message: 'interview_started', meta }));
                }
            }
        }
        else if (type === 'deviceAnnounce') {
            const meta = { friendly_name: resolvedEntity.name };
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_announced`, message: 'announce', meta }));
        }
        else {
            /* istanbul ignore else */
            if (type === 'deviceLeave') {
                const name = data.ieeeAddr;
                const meta = { friendly_name: name };
                await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_removed`, message: 'left_network', meta }));
            }
        }
    }
    async touchlinkFactoryReset() {
        logger_1.default.info('Starting touchlink factory reset...');
        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `touchlink`, message: 'reset_started', meta: { status: 'started' } }));
        const result = await this.zigbee.touchlinkFactoryResetFirst();
        if (result) {
            logger_1.default.info('Successfully factory reset device through Touchlink');
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `touchlink`, message: 'reset_success', meta: { status: 'success' } }));
        }
        else {
            logger_1.default.warning('Failed to factory reset device through Touchlink');
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `touchlink`, message: 'reset_failed', meta: { status: 'failed' } }));
        }
    }
}
exports.default = BridgeLegacy;
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "whitelist", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "deviceOptions", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "permitJoin", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "reset", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "lastSeen", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "elapsed", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "logLevel", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "devices", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "groups", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "rename", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "renameLast", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "addGroup", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "removeGroup", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "forceRemove", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "remove", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "ban", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "removeForceRemoveOrBan", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "touchlinkFactoryReset", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJpZGdlTGVnYWN5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL2V4dGVuc2lvbi9sZWdhY3kvYnJpZGdlTGVnYWN5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxvREFBNEI7QUFDNUIsb0VBQWtDO0FBQ2xDLGtIQUE4RDtBQUU5RCwrREFBdUM7QUFDdkMsOERBQWdEO0FBQ2hELDZEQUFxQztBQUNyQyw2REFBcUM7QUFFckMsTUFBTSxXQUFXLEdBQUcsSUFBSSxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsK0RBQStELENBQUMsQ0FBQztBQUVqSSxNQUFxQixZQUFhLFNBQVEsbUJBQVM7SUFDdkMsb0JBQW9CLEdBQVcsSUFBSSxDQUFDO0lBQ3BDLGdCQUFnQixDQUEwRTtJQUV6RixLQUFLLENBQUMsS0FBSztRQUNoQixJQUFJLENBQUMsZ0JBQWdCLEdBQUc7WUFDcEIsV0FBVyxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzVCLFNBQVMsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUN4QixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDckIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1lBQ2pCLFNBQVMsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUN4QixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDckIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ25CLGFBQWEsRUFBRSxJQUFJLENBQUMsT0FBTztZQUMzQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbkIsV0FBVyxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzVCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNuQixZQUFZLEVBQUUsSUFBSSxDQUFDLFdBQVc7WUFDOUIsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO1lBQ2IsY0FBYyxFQUFF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