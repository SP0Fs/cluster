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
const zhc = __importStar(require("zigbee-herdsman-converters"));
const logger_1 = __importDefault(require("../../util/logger"));
const settings = __importStar(require("../../util/settings"));
const utils_1 = __importDefault(require("../../util/utils"));
const extension_1 = __importDefault(require("../extension"));
const defaultConfiguration = {
    minimumReportInterval: 3,
    maximumReportInterval: 300,
    reportableChange: 1,
};
const ZNLDP12LM = zhc.definitions.find((d) => d.model === 'ZNLDP12LM');
const devicesNotSupportingReporting = [
    zhc.definitions.find((d) => d.model === 'CC2530.ROUTER'),
    zhc.definitions.find((d) => d.model === 'BASICZBR3'),
    zhc.definitions.find((d) => d.model === 'ZM-CSW032-D'),
    zhc.definitions.find((d) => d.model === 'TS0001'),
    zhc.definitions.find((d) => d.model === 'TS0115'),
];
const reportKey = 1;
const getColorCapabilities = async (endpoint) => {
    if (endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') === undefined) {
        await endpoint.read('lightingColorCtrl', ['colorCapabilities']);
    }
    const value = endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities');
    return {
        colorTemperature: (value & (1 << 4)) > 0,
        colorXY: (value & (1 << 3)) > 0,
    };
};
const clusters = {
    genOnOff: [{ attribute: 'onOff', ...defaultConfiguration, minimumReportInterval: 0, reportableChange: 0 }],
    genLevelCtrl: [{ attribute: 'currentLevel', ...defaultConfiguration }],
    lightingColorCtrl: [
        {
            attribute: 'colorTemperature',
            ...defaultConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorTemperature,
        },
        {
            attribute: 'currentX',
            ...defaultConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
        {
            attribute: 'currentY',
            ...defaultConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
    ],
    closuresWindowCovering: [
        { attribute: 'currentPositionLiftPercentage', ...defaultConfiguration },
        { attribute: 'currentPositionTiltPercentage', ...defaultConfiguration },
    ],
};
class Report extends extension_1.default {
    queue = new Set();
    failed = new Set();
    enabled = settings.get().advanced.report;
    shouldIgnoreClusterForDevice(cluster, definition) {
        if (definition === ZNLDP12LM && cluster === 'closuresWindowCovering') {
            // Device announces it but doesn't support it
            // https://github.com/Koenkk/zigbee2mqtt/issues/2611
            return true;
        }
        return false;
    }
    async setupReporting(device) {
        if (this.queue.has(device.ieeeAddr) || this.failed.has(device.ieeeAddr))
            return;
        this.queue.add(device.ieeeAddr);
        const term1 = this.enabled ? 'Setup' : 'Disable';
        const term2 = this.enabled ? 'setup' : 'disabled';
        try {
            for (const ep of device.zh.endpoints) {
                for (const [cluster, configuration] of Object.entries(clusters)) {
                    if (ep.supportsInputCluster(cluster) && !this.shouldIgnoreClusterForDevice(cluster, device.definition)) {
                        logger_1.default.debug(`${term1} reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`);
                        const items = [];
                        for (const entry of configuration) {
                            if (!entry.hasOwnProperty('condition') || (await entry.condition(ep))) {
                                const toAdd = { ...entry };
                                if (!this.enabled)
                                    toAdd.maximumReportInterval = 0xffff;
                                items.push(toAdd);
                                delete items[items.length - 1].condition;
                            }
                        }
                        if (this.enabled) {
                            await ep.bind(cluster, this.zigbee.firstCoordinatorEndpoint());
                        }
                        else {
                            await ep.unbind(cluster, this.zigbee.firstCoordinatorEndpoint());
                        }
                        await ep.configureReporting(cluster, items);
                        logger_1.default.info(`Successfully ${term2} reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`);
                    }
                }
            }
            if (this.enabled) {
                device.zh.meta.reporting = reportKey;
            }
            else {
                delete device.zh.meta.reporting;
                this.eventBus.emitReconfigure({ device });
            }
            this.eventBus.emitDevicesChanged();
        }
        catch (error) {
            logger_1.default.error(`Failed to ${term1.toLowerCase()} reporting for '${device.ieeeAddr}' - ${error.stack}`);
            this.failed.add(device.ieeeAddr);
        }
        device.zh.save();
        this.queue.delete(device.ieeeAddr);
    }
    shouldSetupReporting(device, messageType) {
        if (!device || !device.zh || !device.definition)
            return false;
        // Handle messages of type endDeviceAnnce and devIncoming.
        // This message is typically send when a device comes online after being powered off
        // Ikea TRADFRI tend to forget their reporting after powered off.
        // Re-setup reporting.
        // Only resetup reporting if configuredReportings was not populated yet,
        // else reconfigure is done in zigbee-herdsman-converters ikea.js/bulbOnEvent
        // configuredReportings are saved since Zigbee2MQTT 1.17.0
        // https://github.com/Koenkk/zigbee2mqtt/issues/966
        if (this.enabled &&
            messageType === 'deviceAnnounce' &&
            device.isIkeaTradfri() &&
            device.zh.endpoints.filter((e) => e.configuredReportings.length === 0).length === device.zh.endpoints.length) {
            return true;
        }
        // These do not support reproting.
        // https://github.com/Koenkk/zigbee-herdsman/issues/110
        const philipsIgnoreSw = ['5.127.1.26581', '5.130.1.30000'];
        if (device.zh.manufacturerName === 'Philips' && philipsIgnoreSw.includes(device.zh.softwareBuildID))
            return false;
        if (device.zh.interviewing === true)
            return false;
        if (device.zh.type !== 'Router' || device.zh.powerSource === 'Battery')
            return false;
        // Gledopto devices don't support reporting.
        if (devicesNotSupportingReporting.includes(device.definition) || device.definition.vendor === 'Gledopto')
            return false;
        if (this.enabled && device.zh.meta.hasOwnProperty('reporting') && device.zh.meta.reporting === reportKey) {
            return false;
        }
        if (!this.enabled && !device.zh.meta.hasOwnProperty('reporting')) {
            return false;
        }
        return true;
    }
    async start() {
        for (const device of this.zigbee.devicesIterator(utils_1.default.deviceNotCoordinator)) {
            if (this.shouldSetupReporting(device, null)) {
                await this.setupReporting(device);
            }
        }
        this.eventBus.onDeviceAnnounce(this, (data) => this.onZigbeeEvent_('deviceAnnounce', data.device));
        this.eventBus.onDeviceMessage(this, (data) => this.onZigbeeEvent_('dummy', data.device));
        this.eventBus.onDeviceJoined(this, (data) => this.onZigbeeEvent_('dummy', data.device));
        this.eventBus.onDeviceNetworkAddressChanged(this, (data) => this.onZigbeeEvent_('dummy', data.device));
    }
    async onZigbeeEvent_(type, device) {
        if (this.shouldSetupReporting(device, type)) {
            await this.setupReporting(device);
        }
    }
}
exports.default = Report;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwb3J0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL2V4dGVuc2lvbi9sZWdhY3kvcmVwb3J0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxnRUFBa0Q7QUFFbEQsK0RBQXVDO0FBQ3ZDLDhEQUFnRDtBQUNoRCw2REFBcUM7QUFDckMsNkRBQXFDO0FBRXJDLE1BQU0sb0JBQW9CLEdBQUc7SUFDekIscUJBQXFCLEVBQUUsQ0FBQztJQUN4QixxQkFBcUIsRUFBRSxHQUFHO0lBQzFCLGdCQUFnQixFQUFFLENBQUM7Q0FDdEIsQ0FBQztBQUVGLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLFdBQVcsQ0FBQyxDQUFDO0FBRXZFLE1BQU0sNkJBQTZCLEdBQUc7SUFDbEMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssZUFBZSxDQUFDO0lBQ3hELEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLFdBQVcsQ0FBQztJQUNwRCxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxhQUFhLENBQUM7SUFDdEQsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFDO0lBQ2pELEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLFFB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