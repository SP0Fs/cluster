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
const path_1 = __importDefault(require("path"));
const URI = __importStar(require("uri-js"));
const zigbee_herdsman_1 = require("zigbee-herdsman");
const zhc = __importStar(require("zigbee-herdsman-converters"));
const device_1 = __importDefault(require("../model/device"));
const data_1 = __importDefault(require("../util/data"));
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
function isValidUrl(url) {
    let parsed;
    try {
        parsed = URI.parse(url);
    }
    catch {
        // istanbul ignore next
        return false;
    }
    return parsed.scheme === 'http' || parsed.scheme === 'https';
}
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/ota_update/.+$`);
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/(update|check)`, 'i');
class OTAUpdate extends extension_1.default {
    inProgress = new Set();
    lastChecked = {};
    legacyApi = settings.get().advanced.legacy_api;
    async start() {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);
        if (settings.get().ota.ikea_ota_use_test_url) {
            zhc.ota.tradfri.useTestURL();
        }
        // Let zigbeeOTA module know if the override index file is provided
        let overrideOTAIndex = settings.get().ota.zigbee_ota_override_index_location;
        if (overrideOTAIndex) {
            // If the file name is not a full path, then treat it as a relative to the data directory
            if (!isValidUrl(overrideOTAIndex) && !path_1.default.isAbsolute(overrideOTAIndex)) {
                overrideOTAIndex = data_1.default.joinPath(overrideOTAIndex);
            }
            zhc.ota.zigbeeOTA.useIndexOverride(overrideOTAIndex);
        }
        // In order to support local firmware files we need to let zigbeeOTA know where the data directory is
        zhc.ota.setDataDir(data_1.default.getPath());
        // In case Zigbee2MQTT is restared during an update, progress and remaining values are still in state, remove them.
        for (const device of this.zigbee.devicesIterator(utils_1.default.deviceNotCoordinator)) {
            this.removeProgressAndRemainingFromState(device);
            // Reset update state, e.g. when Z2M restarted during update.
            if (this.state.get(device).update?.state === 'updating') {
                this.state.get(device).update.state = 'available';
            }
        }
    }
    removeProgressAndRemainingFromState(device) {
        delete this.state.get(device).update?.progress;
        delete this.state.get(device).update?.remaining;
    }
    async onZigbeeEvent(data) {
        if (data.type !== 'commandQueryNextImageRequest' || !data.device.definition || this.inProgress.has(data.device.ieeeAddr))
            return;
        logger_1.default.debug(`Device '${data.device.name}' requested OTA`);
        const automaticOTACheckDisabled = settings.get().ota.disable_automatic_update_check;
        let supportsOTA = !!data.device.definition.ota;
        if (supportsOTA && !automaticOTACheckDisabled) {
            // When a device does a next image request, it will usually do it a few times after each other
            // with only 10 - 60 seconds inbetween. It doesn't make sense to check for a new update
            // each time, so this interval can be set by the user. The default is 1,440 minutes (one day).
            const updateCheckInterval = settings.get().ota.update_check_interval * 1000 * 60;
            const check = this.lastChecked.hasOwnProperty(data.device.ieeeAddr)
                ? Date.now() - this.lastChecked[data.device.ieeeAddr] > updateCheckInterval
                : true;
            if (!check)
                return;
            this.lastChecked[data.device.ieeeAddr] = Date.now();
            let availableResult = null;
            try {
                availableResult = await data.device.definition.ota.isUpdateAvailable(data.device.zh, data.data);
            }
            catch (e) {
                supportsOTA = false;
                logger_1.default.debug(`Failed to check if update available for '${data.device.name}' (${e.message})`);
                logger_1.default.debug(e.stack);
            }
            const payload = this.getEntityPublishPayload(data.device, availableResult ?? 'idle');
            await this.publishEntityState(data.device, payload);
            if (availableResult?.available) {
                const message = `Update available for '${data.device.name}'`;
                logger_1.default.info(message);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = { status: 'available', device: data.device.name };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message, meta }));
                }
            }
        }
        // Respond to stop the client from requesting OTAs
        const endpoint = data.device.zh.endpoints.find((e) => e.supportsOutputCluster('genOta')) || data.endpoint;
        await endpoint.commandResponse('genOta', 'queryNextImageResponse', { status: zigbee_herdsman_1.Zcl.Status.NO_IMAGE_AVAILABLE }, undefined, data.meta.zclTransactionSequenceNumber);
        logger_1.default.debug(`Responded to OTA request of '${data.device.name}' with 'NO_IMAGE_AVAILABLE'`);
    }
    async readSoftwareBuildIDAndDateCode(device, sendPolicy) {
        try {
            const endpoint = device.zh.endpoints.find((e) => e.supportsInputCluster('genBasic'));
            const result = await endpoint.read('genBasic', ['dateCode', 'swBuildId'], { sendPolicy });
            return { softwareBuildID: result.swBuildId, dateCode: result.dateCode };
        }
        catch {
            return null;
        }
    }
    getEntityPublishPayload(device, state, progress = null, remaining = null) {
        const deviceUpdateState = this.state.get(device).update;
        const payload = {
            update: {
                state: typeof state === 'string' ? state : state.available ? 'available' : 'idle',
                installed_version: typeof state === 'string' ? deviceUpdateState?.installed_version : state.currentFileVersion,
                latest_version: typeof state === 'string' ? deviceUpdateState?.latest_version : state.otaFileVersion,
            },
        };
        if (progress !== null)
            payload.update.progress = progress;
        if (remaining !== null)
            payload.update.remaining = Math.round(remaining);
        /* istanbul ignore else */
        if (this.legacyApi) {
            payload.update_available = typeof state === 'string' ? state === 'available' : state.available;
        }
        return payload;
    }
    async onMQTTMessage(data) {
        if ((!this.legacyApi || !data.topic.match(legacyTopicRegex)) && !data.topic.match(topicRegex)) {
            return null;
        }
        const message = utils_1.default.parseJSON(data.message, data.message);
        const ID = (typeof message === 'object' && message.hasOwnProperty('id') ? message.id : message);
        const device = this.zigbee.resolveEntity(ID);
        const type = data.topic.substring(data.topic.lastIndexOf('/') + 1);
        const responseData = { id: ID };
        let error = null;
        let errorStack = null;
        if (!(device instanceof device_1.default)) {
            error = `Device '${ID}' does not exist`;
        }
        else if (!device.definition || !device.definition.ota) {
            error = `Device '${device.name}' does not support OTA updates`;
            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const meta = { status: `not_supported`, device: device.name };
                await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: error, meta }));
            }
        }
        else if (this.inProgress.has(device.ieeeAddr)) {
            error = `Update or check for update already in progress for '${device.name}'`;
        }
        else {
            this.inProgress.add(device.ieeeAddr);
            if (type === 'check') {
                const msg = `Checking if update available for '${device.name}'`;
                logger_1.default.info(msg);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = { status: `checking_if_available`, device: device.name };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                }
                try {
                    const availableResult = await device.definition.ota.isUpdateAvailable(device.zh, null);
                    const msg = `${availableResult.available ? 'Update' : 'No update'} available for '${device.name}'`;
                    logger_1.default.info(msg);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {
                            status: availableResult.available ? 'available' : 'not_available',
                            device: device.name,
                        };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                    }
                    const payload = this.getEntityPublishPayload(device, availableResult);
                    await this.publishEntityState(device, payload);
                    this.lastChecked[device.ieeeAddr] = Date.now();
                    responseData.updateAvailable = availableResult.available;
                }
                catch (e) {
                    error = `Failed to check if update available for '${device.name}' (${e.message})`;
                    errorStack = e.stack;
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = { status: `check_failed`, device: device.name };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: error, meta }));
                    }
                }
            }
            else {
                // type === 'update'
                const msg = `Updating '${device.name}' to latest firmware`;
                logger_1.default.info(msg);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = { status: `update_in_progress`, device: device.name };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                }
                try {
                    const onProgress = async (progress, remaining) => {
                        let msg = `Update of '${device.name}' at ${progress.toFixed(2)}%`;
                        if (remaining) {
                            msg += `, ≈ ${Math.round(remaining / 60)} minutes remaining`;
                        }
                        logger_1.default.info(msg);
                        const payload = this.getEntityPublishPayload(device, 'updating', progress, remaining);
                        await this.publishEntityState(device, payload);
                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            const meta = { status: `update_progress`, device: device.name, progress };
                            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                        }
                    };
                    const from_ = await this.readSoftwareBuildIDAndDateCode(device, 'immediate');
                    const fileVersion = await device.definition.ota.updateToLatest(device.zh, onProgress);
                    logger_1.default.info(`Finished update of '${device.name}'`);
                    this.removeProgressAndRemainingFromState(device);
                    const payload = this.getEntityPublishPayload(device, {
                        available: false,
                        currentFileVersion: fileVersion,
                        otaFileVersion: fileVersion,
                    });
                    await this.publishEntityState(device, payload);
                    const to = await this.readSoftwareBuildIDAndDateCode(device);
                    const [fromS, toS] = [(0, json_stable_stringify_without_jsonify_1.default)(from_), (0, json_stable_stringify_without_jsonify_1.default)(to)];
                    logger_1.default.info(`Device '${device.name}' was updated from '${fromS}' to '${toS}'`);
                    responseData.from = from_ ? utils_1.default.toSnakeCase(from_) : null;
                    responseData.to = to ? utils_1.default.toSnakeCase(to) : null;
                    /**
                     * Re-configure after reading software build ID and date code, some devices use a
                     * custom attribute for this (e.g. Develco SMSZB-120)
                     */
                    this.eventBus.emitReconfigure({ device });
                    this.eventBus.emitDevicesChanged();
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = { status: `update_succeeded`, device: device.name, from: from_, to };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message, meta }));
                    }
                }
                catch (e) {
                    logger_1.default.debug(`Update of '${device.name}' failed (${e})`);
                    error = `Update of '${device.name}' failed (${e.message})`;
                    errorStack = e.stack;
                    this.removeProgressAndRemainingFromState(device);
                    const payload = this.getEntityPublishPayload(device, 'available');
                    await this.publishEntityState(device, payload);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = { status: `update_failed`, device: device.name };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: error, meta }));
                    }
                }
            }
            this.inProgress.delete(device.ieeeAddr);
        }
        const triggeredViaLegacyApi = data.topic.match(legacyTopicRegex);
        if (!triggeredViaLegacyApi) {
            const response = utils_1.default.getResponse(message, responseData, error);
            await this.mqtt.publish(`bridge/response/device/ota_update/${type}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
        }
        if (error) {
            logger_1.default.error(error);
            if (errorStack) {
                logger_1.default.debug(errorStack);
            }
        }
    }
}
exports.default = OTAUpdate;
__decorate([
    bind_decorator_1.default
], OTAUpdate.prototype, "onZigbeeEvent", null);
__decorate([
    bind_decorator_1.default
], OTAUpdate.prototype, "onMQTTMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3RhVXBkYXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9vdGFVcGRhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLG9FQUFrQztBQUNsQyxrSEFBOEQ7QUFDOUQsZ0RBQXdCO0FBQ3hCLDRDQUE4QjtBQUM5QixxREFBb0M7QUFDcEMsZ0VBQWtEO0FBRWxELDZEQUFxQztBQUNyQyx3REFBbUM7QUFDbkMsNERBQW9DO0FBQ3BDLDJEQUE2QztBQUM3QywwREFBa0M7QUFDbEMsNERBQW9DO0FBRXBDLFNBQVMsVUFBVSxDQUFDLEdBQVc7SUFDM0IsSUFBSSxNQUFNLENBQUM7SUFDWCxJQUFJLENBQUM7UUFDRCxNQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ0wsdUJBQXVCO1FBQ3ZCLE9BQU8sS0FBSyxDQUFDO0lBQ2pCLENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQyxNQUFNLEtBQUssTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssT0FBTyxDQUFDO0FBQ2pFLENBQUM7QUFlRCxNQUFNLGdCQUFnQixHQUFHLElBQUksTUFBTSxDQUFDLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLHdCQUF3QixDQUFDLENBQUM7QUFDaEcsTUFBTSxVQUFVLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsa0RBQWtELEVBQUUsR0FBRyxDQUFDLENBQUM7QUFFekgsTUFBcUIsU0FBVSxTQUFRLG1CQUFTO0lBQ3BDLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBQ3ZCLFdBQVcsR0FBMEIsRUFBRSxDQUFDO0lBQ3hDLFNBQVMsR0FBRyxRQUFRLENBQUMsR0FB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