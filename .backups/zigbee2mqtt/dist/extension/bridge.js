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
/* eslint-disable camelcase */
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const fs_1 = __importDefault(require("fs"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const jszip_1 = __importDefault(require("jszip"));
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
const winston_transport_1 = __importDefault(require("winston-transport"));
const cluster_1 = require("zigbee-herdsman/dist/zspec/zcl/definition/cluster");
const zhc = __importStar(require("zigbee-herdsman-converters"));
const device_1 = __importDefault(require("../model/device"));
const data_1 = __importDefault(require("../util/data"));
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/(.*)`);
class Bridge extends extension_1.default {
    zigbee2mqttVersion;
    zigbeeHerdsmanVersion;
    zigbeeHerdsmanConvertersVersion;
    coordinatorVersion;
    restartRequired = false;
    lastJoinedDeviceIeeeAddr;
    lastBridgeLoggingPayload;
    logTransport;
    requestLookup;
    async start() {
        this.requestLookup = {
            'device/options': this.deviceOptions,
            'device/configure_reporting': this.deviceConfigureReporting,
            'device/remove': this.deviceRemove,
            'device/interview': this.deviceInterview,
            'device/generate_external_definition': this.deviceGenerateExternalDefinition,
            'device/rename': this.deviceRename,
            'group/add': this.groupAdd,
            'group/options': this.groupOptions,
            'group/remove': this.groupRemove,
            'group/rename': this.groupRename,
            permit_join: this.permitJoin,
            restart: this.restart,
            backup: this.backup,
            'touchlink/factory_reset': this.touchlinkFactoryReset,
            'touchlink/identify': this.touchlinkIdentify,
            'install_code/add': this.installCodeAdd,
            'touchlink/scan': this.touchlinkScan,
            health_check: this.healthCheck,
            coordinator_check: this.coordinatorCheck,
            options: this.bridgeOptions,
            // Below are deprecated
            'config/last_seen': this.configLastSeen,
            'config/homeassistant': this.configHomeAssistant,
            'config/elapsed': this.configElapsed,
            'config/log_level': this.configLogLevel,
        };
        const debugToMQTTFrontend = settings.get().advanced.log_debug_to_mqtt_frontend;
        const baseTopic = settings.get().mqtt.base_topic;
        const bridgeLogging = (message, level, namespace) => {
            const payload = (0, json_stable_stringify_without_jsonify_1.default)({ message, level, namespace });
            if (payload !== this.lastBridgeLoggingPayload) {
                this.lastBridgeLoggingPayload = payload;
                void this.mqtt.publish(`bridge/logging`, payload, {}, baseTopic, true);
            }
        };
        if (debugToMQTTFrontend) {
            class DebugEventTransport extends winston_transport_1.default {
                log(info, next) {
                    bridgeLogging(info.message, info.level, info.namespace);
                    next();
                }
            }
            this.logTransport = new DebugEventTransport();
        }
        else {
            class EventTransport extends winston_transport_1.default {
                log(info, next) {
                    if (info.level !== 'debug') {
                        bridgeLogging(info.message, info.level, info.namespace);
                    }
                    next();
                }
            }
            this.logTransport = new EventTransport();
        }
        logger_1.default.addTransport(this.logTransport);
        this.zigbee2mqttVersion = await utils_1.default.getZigbee2MQTTVersion();
        this.zigbeeHerdsmanVersion = await utils_1.default.getDependencyVersion('zigbee-herdsman');
        this.zigbeeHerdsmanConvertersVersion = await utils_1.default.getDependencyVersion('zigbee-herdsman-converters');
        this.coordinatorVersion = await this.zigbee.getCoordinatorVersion();
        this.eventBus.onEntityRenamed(this, () => this.publishInfo());
        this.eventBus.onGroupMembersChanged(this, () => this.publishGroups());
        this.eventBus.onDevicesChanged(this, () => this.publishDevices() && this.publishInfo() && this.publishDefinitions());
        this.eventBus.onPermitJoinChanged(this, () => !this.zigbee.isStopping() && this.publishInfo());
        this.eventBus.onScenesChanged(this, async () => {
            await this.publishDevices();
            await this.publishGroups();
        });
        // Zigbee events
        const publishEvent = async (type, data) => this.mqtt.publish('bridge/event', (0, json_stable_stringify_without_jsonify_1.default)({ type, data }), { retain: false, qos: 0 });
        this.eventBus.onDeviceJoined(this, async (data) => {
            this.lastJoinedDeviceIeeeAddr = data.device.ieeeAddr;
            await this.publishDevices();
            await publishEvent('device_joined', { friendly_name: data.device.name, ieee_address: data.device.ieeeAddr });
        });
        this.eventBus.onDeviceLeave(this, async (data) => {
            await this.publishDevices();
            await this.publishDefinitions();
            await publishEvent('device_leave', { ieee_address: data.ieeeAddr, friendly_name: data.name });
        });
        this.eventBus.onDeviceNetworkAddressChanged(this, () => this.publishDevices());
        this.eventBus.onDeviceInterview(this, async (data) => {
            await this.publishDevices();
            const payload = { friendly_name: data.device.name, status: data.status, ieee_address: data.device.ieeeAddr };
            if (data.status === 'successful') {
                payload.supported = data.device.isSupported;
                payload.definition = this.getDefinitionPayload(data.device);
            }
            await publishEvent('device_interview', payload);
        });
        this.eventBus.onDeviceAnnounce(this, async (data) => {
            await this.publishDevices();
            await publishEvent('device_announce', { friendly_name: data.device.name, ieee_address: data.device.ieeeAddr });
        });
        await this.publishInfo();
        await this.publishDevices();
        await this.publishGroups();
        await this.publishDefinitions();
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }
    async stop() {
        await super.stop();
        logger_1.default.removeTransport(this.logTransport);
    }
    async onMQTTMessage(data) {
        const match = data.topic.match(requestRegex);
        const key = match?.[1]?.toLowerCase();
        if (key in this.requestLookup) {
            const message = utils_1.default.parseJSON(data.message, data.message);
            try {
                const response = await this.requestLookup[key](message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
            }
            catch (error) {
                logger_1.default.error(`Request '${data.topic}' failed with error: '${error.message}'`);
                logger_1.default.debug(error.stack);
                const response = utils_1.default.getResponse(message, {}, error.message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
            }
        }
    }
    /**
     * Requests
     */
    async deviceOptions(message) {
        return this.changeEntityOptions('device', message);
    }
    async groupOptions(message) {
        return this.changeEntityOptions('group', message);
    }
    async bridgeOptions(message) {
        if (typeof message !== 'object' || typeof message.options !== 'object') {
            throw new Error(`Invalid payload`);
        }
        const newSettings = message.options;
        const restartRequired = settings.apply(newSettings);
        if (restartRequired)
            this.restartRequired = true;
        // Apply some settings on-the-fly.
        if (newSettings.permit_join != undefined) {
            await this.zigbee.permitJoin(settings.get().permit_join);
        }
        if (newSettings.homeassistant != undefined) {
            await this.enableDisableExtension(!!settings.get().homeassistant, 'HomeAssistant');
        }
        if (newSettings.advanced?.log_level != undefined) {
            logger_1.default.setLevel(settings.get().advanced.log_level);
        }
        if (newSettings.advanced?.log_namespaced_levels != undefined) {
            logger_1.default.setNamespacedLevels(settings.get().advanced.log_namespaced_levels);
        }
        if (newSettings.advanced?.log_debug_namespace_ignore != undefined) {
            logger_1.default.setDebugNamespaceIgnore(settings.get().advanced.log_debug_namespace_ignore);
        }
        logger_1.default.info('Successfully changed options');
        await this.publishInfo();
        return utils_1.default.getResponse(message, { restart_required: this.restartRequired }, null);
    }
    async deviceRemove(message) {
        return this.removeEntity('device', message);
    }
    async groupRemove(message) {
        return this.removeEntity('group', message);
    }
    async healthCheck(message) {
        return utils_1.default.getResponse(message, { healthy: true }, null);
    }
    async coordinatorCheck(message) {
        const result = await this.zigbee.coordinatorCheck();
        const missingRouters = result.missingRouters.map((d) => {
            return { ieee_address: d.ieeeAddr, friendly_name: d.name };
        });
        return utils_1.default.getResponse(message, { missing_routers: missingRouters }, null);
    }
    async groupAdd(message) {
        if (typeof message === 'object' && !message.hasOwnProperty('friendly_name')) {
            throw new Error(`Invalid payload`);
        }
        const friendlyName = typeof message === 'object' ? message.friendly_name : message;
        const ID = typeof message === 'object' && message.hasOwnProperty('id') ? message.id : null;
        const group = settings.addGroup(friendlyName, ID);
        this.zigbee.createGroup(group.ID);
        await this.publishGroups();
        return utils_1.default.getResponse(message, { friendly_name: group.friendly_name, id: group.ID }, null);
    }
    async deviceRename(message) {
        return this.renameEntity('device', message);
    }
    async groupRename(message) {
        return this.renameEntity('group', message);
    }
    async restart(message) {
        // Wait 500 ms before restarting so response can be send.
        setTimeout(this.restartCallback, 500);
        logger_1.default.info('Restarting Zigbee2MQTT');
        return utils_1.default.getResponse(message, {}, null);
    }
    async backup(message) {
        await this.zigbee.backup();
        const dataPath = data_1.default.getPath();
        const files = utils_1.default
            .getAllFiles(dataPath)
            .map((f) => [f, f.substring(dataPath.length + 1)])
            .filter((f) => !f[1].startsWith('log'));
        const zip = new jszip_1.default();
        files.forEach((f) => zip.file(f[1], fs_1.default.readFileSync(f[0])));
        const base64Zip = await zip.generateAsync({ type: 'base64' });
        return utils_1.default.getResponse(message, { zip: base64Zip }, null);
    }
    async installCodeAdd(message) {
        if (typeof message === 'object' && !message.hasOwnProperty('value')) {
            throw new Error('Invalid payload');
        }
        const value = typeof message === 'object' ? message.value : message;
        await this.zigbee.addInstallCode(value);
        logger_1.default.info('Successfully added new install code');
        return utils_1.default.getResponse(message, { value }, null);
    }
    async permitJoin(message) {
        if (typeof message === 'object' && !message.hasOwnProperty('value')) {
            throw new Error('Invalid payload');
        }
        let value;
        let time;
        let device = null;
        if (typeof message === 'object') {
            value = message.value;
            time = message.time;
            if (message.device) {
                const resolved = this.zigbee.resolveEntity(message.device);
                if (resolved instanceof device_1.default) {
                    device = resolved;
                }
                else {
                    throw new Error(`Device '${message.device}' does not exist`);
                }
            }
        }
        else {
            value = message;
        }
        if (typeof value === 'string') {
            value = value.toLowerCase() === 'true';
        }
        await this.zigbee.permitJoin(value, device, time);
        const response = { value };
        if (device && typeof message === 'object')
            response.device = message.device;
        if (time && typeof message === 'object')
            response.time = message.time;
        return utils_1.default.getResponse(message, response, null);
    }
    // Deprecated
    async configLastSeen(message) {
        const allowed = ['disable', 'ISO_8601', 'epoch', 'ISO_8601_local'];
        const value = this.getValue(message);
        if (typeof value !== 'string' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }
        settings.set(['advanced', 'last_seen'], value);
        await this.publishInfo();
        return utils_1.default.getResponse(message, { value }, null);
    }
    // Deprecated
    async configHomeAssistant(message) {
        const allowed = [true, false];
        const value = this.getValue(message);
        if (typeof value !== 'boolean' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }
        await this.enableDisableExtension(value, 'HomeAssistant');
        settings.set(['homeassistant'], value);
        await this.publishInfo();
        return utils_1.default.getResponse(message, { value }, null);
    }
    // Deprecated
    async configElapsed(message) {
        const allowed = [true, false];
        const value = this.getValue(message);
        if (typeof value !== 'boolean' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }
        settings.set(['advanced', 'elapsed'], value);
        await this.publishInfo();
        return utils_1.default.getResponse(message, { value }, null);
    }
    // Deprecated
    async configLogLevel(message) {
        const value = this.getValue(message);
        if (typeof value !== 'string' || !settings.LOG_LEVELS.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${settings.LOG_LEVELS}`);
        }
        logger_1.default.setLevel(value);
        await this.publishInfo();
        return utils_1.default.getResponse(message, { value }, null);
    }
    async touchlinkIdentify(message) {
        if (typeof message !== 'object' || !message.hasOwnProperty('ieee_address') || !message.hasOwnProperty('channel')) {
            throw new Error('Invalid payload');
        }
        logger_1.default.info(`Start Touchlink identify of '${message.ieee_address}' on channel ${message.channel}`);
        await this.zigbee.touchlinkIdentify(message.ieee_address, message.channel);
        return utils_1.default.getResponse(message, { ieee_address: message.ieee_address, channel: message.channel }, null);
    }
    async touchlinkFactoryReset(message) {
        let result = false;
        const payload = {};
        if (typeof message === 'object' && message.hasOwnProperty('ieee_address') && message.hasOwnProperty('channel')) {
            logger_1.default.info(`Start Touchlink factory reset of '${message.ieee_address}' on channel ${message.channel}`);
            result = await this.zigbee.touchlinkFactoryReset(message.ieee_address, message.channel);
            payload.ieee_address = message.ieee_address;
            payload.channel = message.channel;
        }
        else {
            logger_1.default.info('Start Touchlink factory reset of first found device');
            result = await this.zigbee.touchlinkFactoryResetFirst();
        }
        if (result) {
            logger_1.default.info('Successfully factory reset device through Touchlink');
            return utils_1.default.getResponse(message, payload, null);
        }
        else {
            logger_1.default.error('Failed to factory reset device through Touchlink');
            throw new Error('Failed to factory reset device through Touchlink');
        }
    }
    async touchlinkScan(message) {
        logger_1.default.info('Start Touchlink scan');
        const result = await this.zigbee.touchlinkScan();
        const found = result.map((r) => {
            return { ieee_address: r.ieeeAddr, channel: r.channel };
        });
        logger_1.default.info('Finished Touchlink scan');
        return utils_1.default.getResponse(message, { found }, null);
    }
    /**
     * Utils
     */
    getValue(message) {
        if (typeof message === 'object') {
            if (!message.hasOwnProperty('value')) {
                throw new Error('No value given');
            }
            return message.value;
        }
        else {
            return message;
        }
    }
    async changeEntityOptions(entityType, message) {
        if (typeof message !== 'object' || !message.hasOwnProperty('id') || !message.hasOwnProperty('options')) {
            throw new Error(`Invalid payload`);
        }
        const cleanup = (o) => {
            delete o.friendlyName;
            delete o.friendly_name;
            delete o.ID;
            delete o.type;
            delete o.devices;
            return o;
        };
        const ID = message.id;
        const entity = this.getEntity(entityType, ID);
        const oldOptions = (0, object_assign_deep_1.default)({}, cleanup(entity.options));
        const restartRequired = settings.changeEntityOptions(ID, message.options);
        if (restartRequired)
            this.restartRequired = true;
        const newOptions = cleanup(entity.options);
        await this.publishInfo();
        logger_1.default.info(`Changed config for ${entityType} ${ID}`);
        this.eventBus.emitEntityOptionsChanged({ from: oldOptions, to: newOptions, entity });
        return utils_1.default.getResponse(message, { from: oldOptions, to: newOptions, id: ID, restart_required: this.restartRequired }, null);
    }
    async deviceConfigureReporting(message) {
        if (typeof message !== 'object' ||
            !message.hasOwnProperty('id') ||
            !message.hasOwnProperty('cluster') ||
            !message.hasOwnProperty('maximum_report_interval') ||
            !message.hasOwnProperty('minimum_report_interval') ||
            !message.hasOwnProperty('reportable_change') ||
            !message.hasOwnProperty('attribute')) {
            throw new Error(`Invalid payload`);
        }
        const device = this.zigbee.resolveEntityAndEndpoint(message.id);
        if (!device.entity)
            throw new Error(`Device '${message.id}' does not exist`);
        const endpoint = device.endpoint;
        if (device.endpointID && !endpoint) {
            throw new Error(`Device '${device.ID}' does not have endpoint '${device.endpointID}'`);
        }
        const coordinatorEndpoint = this.zigbee.firstCoordinatorEndpoint();
        await endpoint.bind(message.cluster, coordinatorEndpoint);
        await endpoint.configureReporting(message.cluster, [
            {
                attribute: message.attribute,
                minimumReportInterval: message.minimum_report_interval,
                maximumReportInterval: message.maximum_report_interval,
                reportableChange: message.reportable_change,
            },
        ], message.options);
        await this.publishDevices();
        logger_1.default.info(`Configured reporting for '${message.id}', '${message.cluster}.${message.attribute}'`);
        return utils_1.default.getResponse(message, {
            id: message.id,
            cluster: message.cluster,
            maximum_report_interval: message.maximum_report_interval,
            minimum_report_interval: message.minimum_report_interval,
            reportable_change: message.reportable_change,
            attribute: message.attribute,
        }, null);
    }
    async deviceInterview(message) {
        if (typeof message !== 'object' || !message.hasOwnProperty('id')) {
            throw new Error(`Invalid payload`);
        }
        const device = this.getEntity('device', message.id);
        logger_1.default.info(`Interviewing '${device.name}'`);
        try {
            await device.zh.interview(true);
            logger_1.default.info(`Successfully interviewed '${device.name}'`);
        }
        catch (error) {
            throw new Error(`interview of '${device.name}' (${device.ieeeAddr}) failed: ${error}`, { cause: error });
        }
        // A re-interview can for example result in a different modelId, therefore reconsider the definition.
        await device.resolveDefinition(true);
        this.eventBus.emitDevicesChanged();
        this.eventBus.emitExposesChanged({ device });
        return utils_1.default.getResponse(message, { id: message.id }, null);
    }
    async deviceGenerateExternalDefinition(message) {
        if (typeof message !== 'object' || !message.hasOwnProperty('id')) {
            throw new Error(`Invalid payload`);
        }
        const device = this.zigbee.resolveEntityAndEndpoint(message.id).entity;
        if (!device)
            throw new Error(`Device '${message.id}' does not exist`);
        const source = await zhc.generateExternalDefinitionSource(device.zh);
        return utils_1.default.getResponse(message, { id: message.id, source }, null);
    }
    async renameEntity(entityType, message) {
        const deviceAndHasLast = entityType === 'device' && typeof message === 'object' && message.last === true;
        if (typeof message !== 'object' || (!message.hasOwnProperty('from') && !deviceAndHasLast) || !message.hasOwnProperty('to')) {
            throw new Error(`Invalid payload`);
        }
        if (deviceAndHasLast && !this.lastJoinedDeviceIeeeAddr) {
            throw new Error('No device has joined since start');
        }
        const from = deviceAndHasLast ? this.lastJoinedDeviceIeeeAddr : message.from;
        const to = message.to;
        const homeAssisantRename = message.hasOwnProperty('homeassistant_rename') ? message.homeassistant_rename : false;
        const entity = this.getEntity(entityType, from);
        const oldFriendlyName = entity.options.friendly_name;
        settings.changeFriendlyName(from, to);
        // Clear retained messages
        await this.mqtt.publish(oldFriendlyName, '', { retain: true });
        this.eventBus.emitEntityRenamed({ entity: entity, homeAssisantRename, from: oldFriendlyName, to });
        if (entity instanceof device_1.default) {
            await this.publishDevices();
        }
        else {
            await this.publishGroups();
            await this.publishInfo();
        }
        // Republish entity state
        await this.publishEntityState(entity, {});
        return utils_1.default.getResponse(message, { from: oldFriendlyName, to, homeassistant_rename: homeAssisantRename }, null);
    }
    async removeEntity(entityType, message) {
        const ID = typeof message === 'object' ? message.id : message.trim();
        const entity = this.getEntity(entityType, ID);
        const friendlyName = entity.name;
        const entityID = entity.ID;
        let block = false;
        let force = false;
        let blockForceLog = '';
        if (entityType === 'device' && typeof message === 'object') {
            block = !!message.block;
            force = !!message.force;
            blockForceLog = ` (block: ${block}, force: ${force})`;
        }
        else if (entityType === 'group' && typeof message === 'object') {
            force = !!message.force;
            blockForceLog = ` (force: ${force})`;
        }
        try {
            logger_1.default.info(`Removing ${entityType} '${entity.name}'${blockForceLog}`);
            const name = entity.name;
            if (entity instanceof device_1.default) {
                if (block) {
                    settings.blockDevice(entity.ieeeAddr);
                }
                if (force) {
                    entity.zh.removeFromDatabase();
                }
                else {
                    await entity.zh.removeFromNetwork();
                }
            }
            else {
                if (force) {
                    entity.zh.removeFromDatabase();
                }
                else {
                    await entity.zh.removeFromNetwork();
                }
            }
            // Fire event
            if (entity instanceof device_1.default) {
                this.eventBus.emitEntityRemoved({ id: entityID, name, type: 'device' });
            }
            else {
                this.eventBus.emitEntityRemoved({ id: entityID, name, type: 'group' });
            }
            // Remove from configuration.yaml
            if (entity instanceof device_1.default) {
                settings.removeDevice(entityID);
            }
            else {
                settings.removeGroup(entityID);
            }
            // Remove from state
            this.state.remove(entityID);
            // Clear any retained messages
            await this.mqtt.publish(friendlyName, '', { retain: true });
            logger_1.default.info(`Successfully removed ${entityType} '${friendlyName}'${blockForceLog}`);
            if (entity instanceof device_1.default) {
                await this.publishGroups();
                await this.publishDevices();
                // Refresh Cluster definition
                await this.publishDefinitions();
                return utils_1.default.getResponse(message, { id: ID, block, force }, null);
            }
            else {
                await this.publishGroups();
                return utils_1.default.getResponse(message, { id: ID, force: force }, null);
            }
        }
        catch (error) {
            throw new Error(`Failed to remove ${entityType} '${friendlyName}'${blockForceLog} (${error})`);
        }
    }
    getEntity(type, ID) {
        const entity = this.zigbee.resolveEntity(ID);
        if (!entity || entity.constructor.name.toLowerCase() !== type) {
            throw new Error(`${utils_1.default.capitalize(type)} '${ID}' does not exist`);
        }
        return entity;
    }
    async publishInfo() {
        const config = (0, object_assign_deep_1.default)({}, settings.get());
        delete config.advanced.network_key;
        delete config.mqtt.password;
        if (config.frontend) {
            delete config.frontend.auth_token;
        }
        const payload = {
            version: this.zigbee2mqttVersion.version,
            commit: this.zigbee2mqttVersion.commitHash,
            zigbee_herdsman_converters: this.zigbeeHerdsmanConvertersVersion,
            zigbee_herdsman: this.zigbeeHerdsmanVersion,
            coordinator: {
                ieee_address: this.zigbee.firstCoordinatorEndpoint().getDevice().ieeeAddr,
                ...this.coordinatorVersion,
            },
            network: utils_1.default.toSnakeCase(await this.zigbee.getNetworkParameters()),
            log_level: logger_1.default.getLevel(),
            permit_join: this.zigbee.getPermitJoin(),
            permit_join_timeout: this.zigbee.getPermitJoinTimeout(),
            restart_required: this.restartRequired,
            config,
            config_schema: settings.schema,
        };
        await this.mqtt.publish('bridge/info', (0, json_stable_stringify_without_jsonify_1.default)(payload), { retain: true, qos: 0 }, settings.get().mqtt.base_topic, true);
    }
    async publishDevices() {
        // XXX: definition<>DefinitionPayload don't match to use `Device[]` type here
        const devices = [];
        for (const device of this.zigbee.devicesIterator()) {
            const endpoints = {};
            for (const endpoint of device.zh.endpoints) {
                const data = {
                    scenes: utils_1.default.getScenes(endpoint),
                    bindings: [],
                    configured_reportings: [],
                    clusters: {
                        input: endpoint.getInputClusters().map((c) => c.name),
                        output: endpoint.getOutputClusters().map((c) => c.name),
                    },
                };
                for (const bind of endpoint.binds) {
                    const target = utils_1.default.isEndpoint(bind.target)
                        ? { type: 'endpoint', ieee_address: bind.target.getDevice().ieeeAddr, endpoint: bind.target.ID }
                        : { type: 'group', id: bind.target.groupID };
                    data.bindings.push({ cluster: bind.cluster.name, target });
                }
                for (const configuredReporting of endpoint.configuredReportings) {
                    data.configured_reportings.push({
                        cluster: configuredReporting.cluster.name,
                        attribute: configuredReporting.attribute.name || configuredReporting.attribute.ID,
                        minimum_report_interval: configuredReporting.minimumReportInterval,
                        maximum_report_interval: configuredReporting.maximumReportInterval,
                        reportable_change: configuredReporting.reportableChange,
                    });
                }
                endpoints[endpoint.ID] = data;
            }
            devices.push({
                ieee_address: device.ieeeAddr,
                type: device.zh.type,
                network_address: device.zh.networkAddress,
                supported: device.isSupported,
                friendly_name: device.name,
                disabled: !!device.options.disabled,
                description: device.options.description,
                definition: this.getDefinitionPayload(device),
                power_source: device.zh.powerSource,
                software_build_id: device.zh.softwareBuildID,
                date_code: device.zh.dateCode,
                model_id: device.zh.modelID,
                interviewing: device.zh.interviewing,
                interview_completed: device.zh.interviewCompleted,
                manufacturer: device.zh.manufacturerName,
                endpoints,
            });
        }
        await this.mqtt.publish('bridge/devices', (0, json_stable_stringify_without_jsonify_1.default)(devices), { retain: true, qos: 0 }, settings.get().mqtt.base_topic, true);
    }
    async publishGroups() {
        // XXX: id<>ID can't use `Group[]` type
        const groups = [];
        for (const group of this.zigbee.groupsIterator()) {
            const members = [];
            for (const member of group.zh.members) {
                members.push({ ieee_address: member.getDevice().ieeeAddr, endpoint: member.ID });
            }
            groups.push({
                id: group.ID,
                friendly_name: group.ID === 901 ? 'default_bind_group' : group.name,
                description: group.options.description,
                scenes: utils_1.default.getScenes(group.zh),
                members,
            });
        }
        await this.mqtt.publish('bridge/groups', (0, json_stable_stringify_without_jsonify_1.default)(groups), { retain: true, qos: 0 }, settings.get().mqtt.base_topic, true);
    }
    async publishDefinitions() {
        const data = {
            clusters: cluster_1.Clusters,
            custom_clusters: {},
        };
        for (const device of this.zigbee.devicesIterator((d) => !utils_1.default.objectIsEmpty(d.customClusters))) {
            data.custom_clusters[device.ieeeAddr] = device.customClusters;
        }
        await this.mqtt.publish('bridge/definitions', (0, json_stable_stringify_without_jsonify_1.default)(data), { retain: true, qos: 0 }, settings.get().mqtt.base_topic, true);
    }
    getDefinitionPayload(device) {
        if (!device.definition) {
            return null;
        }
        // TODO: better typing to avoid @ts-expect-error
        // @ts-expect-error icon is valid for external definitions
        const definitionIcon = device.definition.icon;
        let icon = device.options.icon ?? definitionIcon;
        if (icon) {
            icon = icon.replace('${zigbeeModel}', utils_1.default.sanitizeImageParameter(device.zh.modelID));
            icon = icon.replace('${model}', utils_1.default.sanitizeImageParameter(device.definition.model));
        }
        const payload = {
            model: device.definition.model,
            vendor: device.definition.vendor,
            description: device.definition.description,
            exposes: device.exposes(),
            supports_ota: !!device.definition.ota,
            options: device.definition.options,
            icon,
        };
        return payload;
    }
}
exports.default = Bridge;
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "deviceOptions", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "groupOptions", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "bridgeOptions", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "deviceRemove", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "groupRemove", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "healthCheck", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "coordinatorCheck", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "groupAdd", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "deviceRename", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "groupRename", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "restart", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "backup", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "installCodeAdd", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "permitJoin", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "configLastSeen", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "configHomeAssistant", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "configElapsed", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "configLogLevel", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "touchlinkIdentify", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "touchlinkFactoryReset", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "touchlinkScan", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "deviceConfigureReporting", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "deviceInterview", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "deviceGenerateExternalDefinition", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJpZGdlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9icmlkZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhCQUE4QjtBQUM5QixvRUFBa0M7QUFDbEMsNENBQW9CO0FBQ3BCLGtIQUE4RDtBQUM5RCxrREFBMEI7QUFDMUIsNEVBQWtEO0FBRWxELDBFQUEwQztBQUMxQywrRUFBMkU7QUFFM0UsZ0VBQWtEO0FBRWxELDZEQUFxQztBQUVyQyx3REFBZ0M7QUFDaEMsNERBQW9DO0FBQ3BDLDJEQUE2QztBQUM3QywwREFBa0M7QUFDbEMsNERBQW9DO0FBRXBDLE1BQU0sWUFBWSxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLHNCQUFzQixDQUFDLENBQUM7QUFZekYsTUFBcUIsTUFBTyxTQUFRLG1CQUFTO0lBQ2pDLGtCQUFrQixDQUF3QztJQUMxRCxxQkFBcUIsQ0FBb0I7SUFDekMsK0JBQStCLENBQW9CO0lBQ25ELGtCQUFrQixDQUF3QjtJQUMxQyxlQUFlLEdBQUcsS0FBSyxDQUFDO0lBQ3hCLHdCQUF3QixDQUFTO0lBQ2pDLHdCQUF3QixDQUFTO0lBQ2pDLFlBQVksQ0FBb0I7SUFDaEMsYUFBYSxDQUF5RTtJQUVyRixLQUFLLENBQUMsS0FBSztRQUNoQixJQUFJLENBQUMsYUFBYSxHQUFHO1lBQ2pCLGdCQUFnQixFQUFFLElBQUksQ0FBQyxhQUFhO1lBQ3BDLDRCQUE0QixFQUFFLElBQUksQ0FBQyx3QkFBd0I7WUFDM0QsZUFBZSxFQUFFLElBQUksQ0FBQyxZQUFZO1lBQ2xDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxlQUFlO1lBQ3hDLHFDQUFxQyxFQUFFLElBQUksQ0FBQyxnQ0FBZ0M7WUFDNUUsZUFBZSxFQUFFLElBQUksQ0FBQyxZQUFZO1lBQ2xDLFdBQVcsRUFB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