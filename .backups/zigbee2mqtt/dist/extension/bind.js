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
const debounce_1 = __importDefault(require("debounce"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const zigbee_herdsman_1 = require("zigbee-herdsman");
const device_1 = __importDefault(require("../model/device"));
const group_1 = __importDefault(require("../model/group"));
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
const LEGACY_API = settings.get().advanced.legacy_api;
const LEGACY_TOPIC_REGEX = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);
const TOPIC_REGEX = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/(bind|unbind)`);
const ALL_CLUSTER_CANDIDATES = [
    'genScenes',
    'genOnOff',
    'genLevelCtrl',
    'lightingColorCtrl',
    'closuresWindowCovering',
    'hvacThermostat',
    'msIlluminanceMeasurement',
    'msTemperatureMeasurement',
    'msRelativeHumidity',
    'msSoilMoisture',
    'msCO2',
];
// See zigbee-herdsman-converters
const DEFAULT_BIND_GROUP = { type: 'group_number', ID: 901, name: 'default_bind_group' };
const DEFAULT_REPORT_CONFIG = { minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1 };
const getColorCapabilities = async (endpoint) => {
    if (endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') == null) {
        await endpoint.read('lightingColorCtrl', ['colorCapabilities']);
    }
    const value = endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities');
    return {
        colorTemperature: (value & (1 << 4)) > 0,
        colorXY: (value & (1 << 3)) > 0,
    };
};
const REPORT_CLUSTERS = {
    genOnOff: [{ attribute: 'onOff', ...DEFAULT_REPORT_CONFIG, minimumReportInterval: 0, reportableChange: 0 }],
    genLevelCtrl: [{ attribute: 'currentLevel', ...DEFAULT_REPORT_CONFIG }],
    lightingColorCtrl: [
        {
            attribute: 'colorTemperature',
            ...DEFAULT_REPORT_CONFIG,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorTemperature,
        },
        {
            attribute: 'currentX',
            ...DEFAULT_REPORT_CONFIG,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
        {
            attribute: 'currentY',
            ...DEFAULT_REPORT_CONFIG,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
    ],
    closuresWindowCovering: [
        { attribute: 'currentPositionLiftPercentage', ...DEFAULT_REPORT_CONFIG },
        { attribute: 'currentPositionTiltPercentage', ...DEFAULT_REPORT_CONFIG },
    ],
};
const POLL_ON_MESSAGE = [
    {
        // On messages that have the cluster and type of below
        cluster: {
            manuSpecificPhilips: [
                { type: 'commandHueNotification', data: { button: 2 } },
                { type: 'commandHueNotification', data: { button: 3 } },
            ],
            genLevelCtrl: [
                { type: 'commandStep', data: {} },
                { type: 'commandStepWithOnOff', data: {} },
                { type: 'commandStop', data: {} },
                { type: 'commandMoveWithOnOff', data: {} },
                { type: 'commandStopWithOnOff', data: {} },
                { type: 'commandMove', data: {} },
                { type: 'commandMoveToLevelWithOnOff', data: {} },
            ],
            genScenes: [{ type: 'commandRecall', data: {} }],
        },
        // Read the following attributes
        read: { cluster: 'genLevelCtrl', attributes: ['currentLevel'] },
        // When the bound devices/members of group have the following manufacturerIDs
        manufacturerIDs: [
            zigbee_herdsman_1.Zcl.ManufacturerCode.SIGNIFY_NETHERLANDS_B_V,
            zigbee_herdsman_1.Zcl.ManufacturerCode.ATMEL,
            zigbee_herdsman_1.Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            zigbee_herdsman_1.Zcl.ManufacturerCode.MUELLER_LICHT_INTERNATIONAL_INC,
            zigbee_herdsman_1.Zcl.ManufacturerCode.TELINK_MICRO,
            zigbee_herdsman_1.Zcl.ManufacturerCode.BUSCH_JAEGER_ELEKTRO,
        ],
        manufacturerNames: ['GLEDOPTO', 'Trust International B.V.\u0000'],
    },
    {
        cluster: {
            genLevelCtrl: [
                { type: 'commandStepWithOnOff', data: {} },
                { type: 'commandMoveWithOnOff', data: {} },
                { type: 'commandStopWithOnOff', data: {} },
                { type: 'commandMoveToLevelWithOnOff', data: {} },
            ],
            genOnOff: [
                { type: 'commandOn', data: {} },
                { type: 'commandOff', data: {} },
                { type: 'commandOffWithEffect', data: {} },
                { type: 'commandToggle', data: {} },
            ],
            genScenes: [{ type: 'commandRecall', data: {} }],
            manuSpecificPhilips: [
                { type: 'commandHueNotification', data: { button: 1 } },
                { type: 'commandHueNotification', data: { button: 4 } },
            ],
        },
        read: { cluster: 'genOnOff', attributes: ['onOff'] },
        manufacturerIDs: [
            zigbee_herdsman_1.Zcl.ManufacturerCode.SIGNIFY_NETHERLANDS_B_V,
            zigbee_herdsman_1.Zcl.ManufacturerCode.ATMEL,
            zigbee_herdsman_1.Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            zigbee_herdsman_1.Zcl.ManufacturerCode.MUELLER_LICHT_INTERNATIONAL_INC,
            zigbee_herdsman_1.Zcl.ManufacturerCode.TELINK_MICRO,
            zigbee_herdsman_1.Zcl.ManufacturerCode.BUSCH_JAEGER_ELEKTRO,
        ],
        manufacturerNames: ['GLEDOPTO', 'Trust International B.V.\u0000'],
    },
    {
        cluster: {
            genScenes: [{ type: 'commandRecall', data: {} }],
        },
        read: {
            cluster: 'lightingColorCtrl',
            attributes: [],
            // Since not all devices support the same attributes they need to be calculated dynamically
            // depending on the capabilities of the endpoint.
            attributesForEndpoint: async (endpoint) => {
                const supportedAttrs = await getColorCapabilities(endpoint);
                const readAttrs = [];
                /* istanbul ignore else */
                if (supportedAttrs.colorXY) {
                    readAttrs.push('currentX', 'currentY');
                }
                /* istanbul ignore else */
                if (supportedAttrs.colorTemperature) {
                    readAttrs.push('colorTemperature');
                }
                return readAttrs;
            },
        },
        manufacturerIDs: [
            zigbee_herdsman_1.Zcl.ManufacturerCode.SIGNIFY_NETHERLANDS_B_V,
            zigbee_herdsman_1.Zcl.ManufacturerCode.ATMEL,
            zigbee_herdsman_1.Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            zigbee_herdsman_1.Zcl.ManufacturerCode.MUELLER_LICHT_INTERNATIONAL_INC,
            zigbee_herdsman_1.Zcl.ManufacturerCode.TELINK_MICRO,
            // Note: ManufacturerCode.BUSCH_JAEGER is left out intentionally here as their devices don't support colors
        ],
        manufacturerNames: ['GLEDOPTO', 'Trust International B.V.\u0000'],
    },
];
class Bind extends extension_1.default {
    pollDebouncers = {};
    async start() {
        this.eventBus.onDeviceMessage(this, this.poll);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);
    }
    parseMQTTMessage(data) {
        let type = null;
        let sourceKey = null;
        let targetKey = null;
        let clusters = null;
        let skipDisableReporting = false;
        if (LEGACY_API && data.topic.match(LEGACY_TOPIC_REGEX)) {
            const topic = data.topic.replace(`${settings.get().mqtt.base_topic}/bridge/`, '');
            type = topic.split('/')[0];
            sourceKey = topic.replace(`${type}/`, '');
            targetKey = data.message;
        }
        else if (data.topic.match(TOPIC_REGEX)) {
            type = data.topic.endsWith('unbind') ? 'unbind' : 'bind';
            const message = JSON.parse(data.message);
            sourceKey = message.from;
            targetKey = message.to;
            clusters = message.clusters;
            skipDisableReporting = 'skip_disable_reporting' in message ? message.skip_disable_reporting : false;
        }
        return { type, sourceKey, targetKey, clusters, skipDisableReporting };
    }
    async onMQTTMessage(data) {
        const { type, sourceKey, targetKey, clusters, skipDisableReporting } = this.parseMQTTMessage(data);
        if (!type) {
            return null;
        }
        const message = utils_1.default.parseJSON(data.message, data.message);
        let error = null;
        const parsedSource = this.zigbee.resolveEntityAndEndpoint(sourceKey);
        const parsedTarget = this.zigbee.resolveEntityAndEndpoint(targetKey);
        const source = parsedSource.entity;
        const target = targetKey === DEFAULT_BIND_GROUP.name ? DEFAULT_BIND_GROUP : parsedTarget.entity;
        const responseData = { from: sourceKey, to: targetKey };
        if (!source || !(source instanceof device_1.default)) {
            error = `Source device '${sourceKey}' does not exist`;
        }
        else if (parsedSource.endpointID && !parsedSource.endpoint) {
            error = `Source device '${parsedSource.ID}' does not have endpoint '${parsedSource.endpointID}'`;
        }
        else if (!target) {
            error = `Target device or group '${targetKey}' does not exist`;
        }
        else if (target instanceof device_1.default && parsedTarget.endpointID && !parsedTarget.endpoint) {
            error = `Target device '${parsedTarget.ID}' does not have endpoint '${parsedTarget.endpointID}'`;
        }
        else {
            const successfulClusters = [];
            const failedClusters = [];
            const attemptedClusters = [];
            const bindSource = parsedSource.endpoint;
            const bindTarget = target instanceof device_1.default ? parsedTarget.endpoint : target instanceof group_1.default ? target.zh : Number(target.ID);
            // Find which clusters are supported by both the source and target.
            // Groups are assumed to support all clusters.
            const clusterCandidates = clusters ?? ALL_CLUSTER_CANDIDATES;
            for (const cluster of clusterCandidates) {
                let matchingClusters = false;
                const anyClusterValid = utils_1.default.isZHGroup(bindTarget) || typeof bindTarget === 'number' || target.zh.type === 'Coordinator';
                if (!anyClusterValid && utils_1.default.isEndpoint(bindTarget)) {
                    matchingClusters =
                        (bindTarget.supportsInputCluster(cluster) && bindSource.supportsOutputCluster(cluster)) ||
                            (bindSource.supportsInputCluster(cluster) && bindTarget.supportsOutputCluster(cluster));
                }
                const sourceValid = bindSource.supportsInputCluster(cluster) || bindSource.supportsOutputCluster(cluster);
                if (sourceValid && (anyClusterValid || matchingClusters)) {
                    logger_1.default.debug(`${type}ing cluster '${cluster}' from '${source.name}' to '${target.name}'`);
                    attemptedClusters.push(cluster);
                    try {
                        if (type === 'bind') {
                            await bindSource.bind(cluster, bindTarget);
                        }
                        else {
                            await bindSource.unbind(cluster, bindTarget);
                        }
                        successfulClusters.push(cluster);
                        logger_1.default.info(`Successfully ${type === 'bind' ? 'bound' : 'unbound'} cluster '${cluster}' from '${source.name}' to '${target.name}'`);
                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${type}`, message: { from: source.name, to: target.name, cluster } }));
                        }
                    }
                    catch (error) {
                        failedClusters.push(cluster);
                        logger_1.default.error(`Failed to ${type} cluster '${cluster}' from '${source.name}' to '${target.name}' (${error})`);
                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${type}_failed`, message: { from: source.name, to: target.name, cluster } }));
                        }
                    }
                }
            }
            if (attemptedClusters.length === 0) {
                logger_1.default.error(`Nothing to ${type} from '${source.name}' to '${target.name}'`);
                error = `Nothing to ${type}`;
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${type}_failed`, message: { from: source.name, to: target.name } }));
                }
            }
            else if (failedClusters.length === attemptedClusters.length) {
                error = `Failed to ${type}`;
            }
            responseData[`clusters`] = successfulClusters;
            responseData[`failed`] = failedClusters;
            if (successfulClusters.length !== 0) {
                if (type === 'bind') {
                    await this.setupReporting(bindSource.binds.filter((b) => successfulClusters.includes(b.cluster.name) && b.target === bindTarget));
                }
                else if (typeof bindTarget !== 'number' && !skipDisableReporting) {
                    await this.disableUnnecessaryReportings(bindTarget);
                }
            }
        }
        const triggeredViaLegacyApi = data.topic.match(LEGACY_TOPIC_REGEX);
        if (!triggeredViaLegacyApi) {
            const response = utils_1.default.getResponse(message, responseData, error);
            await this.mqtt.publish(`bridge/response/device/${type}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
        }
        if (error) {
            logger_1.default.error(error);
        }
        else {
            this.eventBus.emitDevicesChanged();
        }
    }
    async onGroupMembersChanged(data) {
        if (data.action === 'add') {
            const bindsToGroup = [];
            for (const device of this.zigbee.devicesIterator(utils_1.default.deviceNotCoordinator)) {
                for (const endpoint of device.zh.endpoints) {
                    for (const bind of endpoint.binds) {
                        if (bind.target === data.group.zh) {
                            bindsToGroup.push(bind);
                        }
                    }
                }
            }
            await this.setupReporting(bindsToGroup);
        }
        else {
            // action === remove/remove_all
            if (!data.skipDisableReporting) {
                await this.disableUnnecessaryReportings(data.endpoint);
            }
        }
    }
    getSetupReportingEndpoints(bind, coordinatorEp) {
        const endpoints = utils_1.default.isEndpoint(bind.target) ? [bind.target] : bind.target.members;
        return endpoints.filter((e) => {
            if (!e.supportsInputCluster(bind.cluster.name)) {
                return false;
            }
            const hasConfiguredReporting = e.configuredReportings.some((c) => c.cluster.name === bind.cluster.name);
            if (!hasConfiguredReporting) {
                return true;
            }
            const hasBind = e.binds.some((b) => b.cluster.name === bind.cluster.name && b.target === coordinatorEp);
            return !hasBind;
        });
    }
    async setupReporting(binds) {
        const coordinatorEndpoint = this.zigbee.firstCoordinatorEndpoint();
        for (const bind of binds) {
            /* istanbul ignore else */
            if (bind.cluster.name in REPORT_CLUSTERS) {
                for (const endpoint of this.getSetupReportingEndpoints(bind, coordinatorEndpoint)) {
                    const entity = `${this.zigbee.resolveEntity(endpoint.getDevice()).name}/${endpoint.ID}`;
                    try {
                        await endpoint.bind(bind.cluster.name, coordinatorEndpoint);
                        const items = [];
                        for (const c of REPORT_CLUSTERS[bind.cluster.name]) {
                            /* istanbul ignore else */
                            if (!c.condition || (await c.condition(endpoint))) {
                                const i = { ...c };
                                delete i.condition;
                                items.push(i);
                            }
                        }
                        await endpoint.configureReporting(bind.cluster.name, items);
                        logger_1.default.info(`Successfully setup reporting for '${entity}' cluster '${bind.cluster.name}'`);
                    }
                    catch (error) {
                        logger_1.default.warning(`Failed to setup reporting for '${entity}' cluster '${bind.cluster.name}' (${error.message})`);
                    }
                }
            }
        }
        this.eventBus.emitDevicesChanged();
    }
    async disableUnnecessaryReportings(target) {
        const coordinator = this.zigbee.firstCoordinatorEndpoint();
        const endpoints = utils_1.default.isEndpoint(target) ? [target] : target.members;
        const allBinds = [];
        for (const device of this.zigbee.devicesIterator(utils_1.default.deviceNotCoordinator)) {
            for (const endpoint of device.zh.endpoints) {
                for (const bind of endpoint.binds) {
                    allBinds.push(bind);
                }
            }
        }
        for (const endpoint of endpoints) {
            const device = this.zigbee.resolveEntity(endpoint.getDevice());
            const entity = `${device.name}/${endpoint.ID}`;
            const requiredClusters = [];
            const boundClusters = [];
            for (const bind of allBinds) {
                if (utils_1.default.isEndpoint(bind.target) ? bind.target === endpoint : bind.target.members.includes(endpoint)) {
                    requiredClusters.push(bind.cluster.name);
                }
            }
            for (const b of endpoint.binds) {
                /* istanbul ignore else */
                if (b.target === coordinator && !requiredClusters.includes(b.cluster.name) && b.cluster.name in REPORT_CLUSTERS) {
                    boundClusters.push(b.cluster.name);
                }
            }
            for (const cluster of boundClusters) {
                try {
                    await endpoint.unbind(cluster, coordinator);
                    const items = [];
                    for (const item of REPORT_CLUSTERS[cluster]) {
                        /* istanbul ignore else */
                        if (!item.condition || (await item.condition(endpoint))) {
                            const i = { ...item };
                            delete i.condition;
                            items.push({ ...i, maximumReportInterval: 0xffff });
                        }
                    }
                    await endpoint.configureReporting(cluster, items);
                    logger_1.default.info(`Successfully disabled reporting for '${entity}' cluster '${cluster}'`);
                }
                catch (error) {
                    logger_1.default.warning(`Failed to disable reporting for '${entity}' cluster '${cluster}' (${error.message})`);
                }
            }
            this.eventBus.emitReconfigure({ device });
        }
    }
    async poll(data) {
        /**
         * This method poll bound endpoints and group members for state changes.
         *
         * A use case is e.g. a Hue Dimmer switch bound to a Hue bulb.
         * Hue bulbs only report their on/off state.
         * When dimming the bulb via the dimmer switch the state is therefore not reported.
         * When we receive a message from a Hue dimmer we read the brightness from the bulb (if bound).
         */
        const polls = POLL_ON_MESSAGE.filter((p) => p.cluster[data.cluster]?.some((c) => c.type === data.type && utils_1.default.equalsPartial(data.data, c.data)));
        if (polls.length) {
            const toPoll = new Set();
            // Add bound devices
            for (const endpoint of data.device.zh.endpoints) {
                for (const bind of endpoint.binds) {
                    if (utils_1.default.isEndpoint(bind.target) && bind.target.getDevice().type !== 'Coordinator') {
                        toPoll.add(bind.target);
                    }
                }
            }
            // If message is published to a group, add members of the group
            const group = data.groupID && data.groupID !== 0 && this.zigbee.groupByID(data.groupID);
            if (group) {
                for (const member of group.zh.members) {
                    toPoll.add(member);
                }
            }
            for (const endpoint of toPoll) {
                for (const poll of polls) {
                    if ((!poll.manufacturerIDs.includes(endpoint.getDevice().manufacturerID) &&
                        !poll.manufacturerNames.includes(endpoint.getDevice().manufacturerName)) ||
                        !endpoint.supportsInputCluster(poll.read.cluster)) {
                        continue;
                    }
                    let readAttrs = poll.read.attributes;
                    if (poll.read.attributesForEndpoint) {
                        const attrsForEndpoint = await poll.read.attributesForEndpoint(endpoint);
                        readAttrs = [...poll.read.attributes, ...attrsForEndpoint];
                    }
                    const key = `${endpoint.getDevice().ieeeAddr}_${endpoint.ID}_${POLL_ON_MESSAGE.indexOf(poll)}`;
                    if (!this.pollDebouncers[key]) {
                        this.pollDebouncers[key] = (0, debounce_1.default)(async () => {
                            try {
                                await endpoint.read(poll.read.cluster, readAttrs);
                            }
                            catch (error) {
                                logger_1.default.error(`Failed to poll ${readAttrs} from ${this.zigbee.resolveEntity(endpoint.getDevice()).name} (${error.message})`);
                            }
                        }, 1000);
                    }
                    this.pollDebouncers[key]();
                }
            }
        }
    }
}
exports.default = Bind;
__decorate([
    bind_decorator_1.default
], Bind.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], Bind.prototype, "onGroupMembersChanged", null);
__decorate([
    bind_decorator_1.default
], Bind.prototype, "poll", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmluZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vYmluZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsb0VBQWtDO0FBQ2xDLHdEQUFnQztBQUNoQyxrSEFBOEQ7QUFDOUQscURBQW9DO0FBR3BDLDZEQUFxQztBQUNyQywyREFBbUM7QUFDbkMsNERBQW9DO0FBQ3BDLDJEQUE2QztBQUM3QywwREFBa0M7QUFDbEMsNERBQW9DO0FBRXBDLE1BQU0sVUFBVSxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO0FBQ3RELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsMkJBQTJCLENBQUMsQ0FBQztBQUNyRyxNQUFNLFdBQVcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxzQ0FBc0MsQ0FBQyxDQUFDO0FBQ3pHLE1BQU0sc0JBQXNCLEdBQTJCO0lBQ25ELFdBQVc7SUFDWCxVQUFVO0lBQ1YsY0FBYztJQUNkLG1CQUFtQjtJQUNuQix3QkFBd0I7SUFDeEIsZ0JBQWdCO0lBQ2hCLDBCQUEwQjtJQUMxQiwwQkFBMEI7SUFDMUIsb0JBQW9CO0lBQ3BCLGdCQUFnQjtJQUNoQixPQUFPO0NBQ1YsQ0FBQztBQUVGLGlDQUFpQztBQUNqQyxNQUFNLGtCQUFrQixHQUFHLEVBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBQyxDQUFDO0FBQ3ZGLE1BQU0scUJBQXFCLEdBQUcsRUFBQyxxQkFBcUIsRUFBRSxDQUFDLEVBQUUscUJBQXFCLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixFQUFFLENBQUMs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