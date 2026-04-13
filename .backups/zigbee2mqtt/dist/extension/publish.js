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
exports.loadTopicGetSetRegex = void 0;
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const zhc = __importStar(require("zigbee-herdsman-converters"));
const philips = __importStar(require("zigbee-herdsman-converters/lib/philips"));
const device_1 = __importDefault(require("../model/device"));
const group_1 = __importDefault(require("../model/group"));
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
let topicGetSetRegex;
// Used by `publish.test.js` to reload regex when changing `mqtt.base_topic`.
const loadTopicGetSetRegex = () => {
    topicGetSetRegex = new RegExp(`^${settings.get().mqtt.base_topic}/(?!bridge)(.+?)/(get|set)(?:/(.+))?$`);
};
exports.loadTopicGetSetRegex = loadTopicGetSetRegex;
(0, exports.loadTopicGetSetRegex)();
const stateValues = ['on', 'off', 'toggle', 'open', 'close', 'stop', 'lock', 'unlock'];
const sceneConverterKeys = ['scene_store', 'scene_add', 'scene_remove', 'scene_remove_all', 'scene_rename'];
// Legacy: don't provide default converters anymore, this is required by older z2m installs not saving group members
const defaultGroupConverters = [
    zhc.toZigbee.light_onoff_brightness,
    zhc.toZigbee.light_color_colortemp,
    philips.tz.effect, // Support Hue effects for groups
    zhc.toZigbee.ignore_transition,
    zhc.toZigbee.cover_position_tilt,
    zhc.toZigbee.thermostat_occupied_heating_setpoint,
    zhc.toZigbee.tint_scene,
    zhc.toZigbee.light_brightness_move,
    zhc.toZigbee.light_brightness_step,
    zhc.toZigbee.light_colortemp_step,
    zhc.toZigbee.light_colortemp_move,
    zhc.toZigbee.light_hue_saturation_move,
    zhc.toZigbee.light_hue_saturation_step,
];
class Publish extends extension_1.default {
    async start() {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }
    parseTopic(topic) {
        // The function supports the following topic formats (below are for 'set'. 'get' will look the same):
        // - <base_topic>/device_name/set (endpoint and attribute is defined in the payload)
        // - <base_topic>/device_name/set/attribute (default endpoint used)
        // - <base_topic>/device_name/endpoint/set (attribute is defined in the payload)
        // - <base_topic>/device_name/endpoint/set/attribute (payload is the value)
        // Make the rough split on get/set keyword.
        // Before the get/set is the device name and optional endpoint name.
        // After it there will be an optional attribute name.
        const match = topic.match(topicGetSetRegex);
        if (!match)
            return null;
        const deviceNameAndEndpoint = match[1];
        const attribute = match[3];
        // Now parse the device/group name, and endpoint name
        const entity = this.zigbee.resolveEntityAndEndpoint(deviceNameAndEndpoint);
        return { ID: entity.ID, endpoint: entity.endpointID, type: match[2], attribute: attribute };
    }
    parseMessage(parsedTopic, data) {
        if (parsedTopic.attribute) {
            try {
                return { [parsedTopic.attribute]: JSON.parse(data.message) };
            }
            catch {
                return { [parsedTopic.attribute]: data.message };
            }
        }
        else {
            try {
                return JSON.parse(data.message);
            }
            catch {
                if (stateValues.includes(data.message.toLowerCase())) {
                    return { state: data.message };
                }
                else {
                    return null;
                }
            }
        }
    }
    async legacyLog(payload) {
        /* istanbul ignore else */
        if (settings.get().advanced.legacy_api) {
            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)(payload));
        }
    }
    legacyRetrieveState(re, converter, result, target, key, meta) {
        // It's possible for devices to get out of sync when writing an attribute that's not reportable.
        // So here we re-read the value after a specified timeout, this timeout could for example be the
        // transition time of a color change or for forcing a state read for devices that don't
        // automatically report a new state when set.
        // When reporting is requested for a device (report: true in device-specific settings) we won't
        // ever issue a read here, as we assume the device will properly report changes.
        // Only do this when the retrieve_state option is enabled for this device.
        // retrieve_state == deprecated
        if (re instanceof device_1.default && result && result.hasOwnProperty('readAfterWriteTime') && re.options.retrieve_state) {
            setTimeout(() => converter.convertGet(target, key, meta), result.readAfterWriteTime);
        }
    }
    updateMessageHomeAssistant(message, entityState) {
        /**
         * Home Assistant always publishes 'state', even when e.g. only setting
         * the color temperature. This would lead to 2 zigbee publishes, where the first one
         * (state) is probably unnecessary.
         */
        if (settings.get().homeassistant) {
            const hasColorTemp = message.hasOwnProperty('color_temp');
            const hasColor = message.hasOwnProperty('color');
            const hasBrightness = message.hasOwnProperty('brightness');
            const isOn = entityState.state === 'ON' ? true : false;
            if (isOn && (hasColorTemp || hasColor) && !hasBrightness) {
                delete message.state;
                logger_1.default.debug('Skipping state because of Home Assistant');
            }
        }
    }
    async onMQTTMessage(data) {
        const parsedTopic = this.parseTopic(data.topic);
        if (!parsedTopic)
            return;
        const re = this.zigbee.resolveEntity(parsedTopic.ID);
        if (re == null) {
            await this.legacyLog({ type: `entity_not_found`, message: { friendly_name: parsedTopic.ID } });
            logger_1.default.error(`Entity '${parsedTopic.ID}' is unknown`);
            return;
        }
        // Get entity details
        const definition = re instanceof device_1.default ? re.definition : re.membersDefinitions();
        const target = re instanceof group_1.default ? re.zh : re.endpoint(parsedTopic.endpoint);
        if (target == null) {
            logger_1.default.error(`Device '${re.name}' has no endpoint '${parsedTopic.endpoint}'`);
            return;
        }
        const device = re instanceof device_1.default ? re.zh : null;
        const entitySettings = re.options;
        const entityState = this.state.get(re);
        const membersState = re instanceof group_1.default
            ? Object.fromEntries(re.zh.members.map((e) => [e.getDevice().ieeeAddr, this.state.get(this.zigbee.resolveEntity(e.getDevice().ieeeAddr))]))
            : null;
        let converters;
        {
            if (Array.isArray(definition)) {
                const c = new Set(definition.map((d) => d.toZigbee).flat());
                if (c.size == 0)
                    converters = defaultGroupConverters;
                else
                    converters = Array.from(c);
            }
            else {
                converters = definition.toZigbee;
            }
        }
        // Convert the MQTT message to a Zigbee message.
        const message = this.parseMessage(parsedTopic, data);
        if (message == null) {
            logger_1.default.error(`Invalid message '${message}', skipping...`);
            return;
        }
        this.updateMessageHomeAssistant(message, entityState);
        /**
         * Order state & brightness based on current bulb state
         *
         * Not all bulbs support setting the color/color_temp while it is off
         * this results in inconsistent behavior between different vendors.
         *
         * bulb on => move state & brightness to the back
         * bulb off => move state & brightness to the front
         */
        const entries = Object.entries(message);
        const sorter = typeof message.state === 'string' && message.state.toLowerCase() === 'off' ? 1 : -1;
        entries.sort((a) => (['state', 'brightness', 'brightness_percent'].includes(a[0]) ? sorter : sorter * -1));
        // For each attribute call the corresponding converter
        const usedConverters = {};
        const toPublish = {};
        const toPublishEntity = {};
        const addToToPublish = (entity, payload) => {
            const ID = entity.ID;
            if (!(ID in toPublish)) {
                toPublish[ID] = {};
                toPublishEntity[ID] = entity;
            }
            toPublish[ID] = { ...toPublish[ID], ...payload };
        };
        const endpointNames = re instanceof device_1.default ? re.getEndpointNames() : [];
        const propertyEndpointRegex = new RegExp(`^(.*?)_(${endpointNames.join('|')})$`);
        for (const entry of entries) {
            let key = entry[0];
            const value = entry[1];
            let endpointName = parsedTopic.endpoint;
            let localTarget = target;
            let endpointOrGroupID = utils_1.default.isEndpoint(target) ? target.ID : target.groupID;
            // When the key has a endpointName included (e.g. state_right), this will override the target.
            const propertyEndpointMatch = key.match(propertyEndpointRegex);
            if (re instanceof device_1.default && propertyEndpointMatch) {
                endpointName = propertyEndpointMatch[2];
                key = propertyEndpointMatch[1];
                localTarget = re.endpoint(endpointName);
                endpointOrGroupID = localTarget.ID;
            }
            if (!usedConverters.hasOwnProperty(endpointOrGroupID))
                usedConverters[endpointOrGroupID] = [];
            /* istanbul ignore next */
            // Match any key if the toZigbee converter defines no key.
            const converter = converters.find((c) => (!c.key || c.key.includes(key)) && (!c.endpoint || c.endpoint == endpointName));
            if (parsedTopic.type === 'set' && usedConverters[endpointOrGroupID].includes(converter)) {
                // Use a converter for set only once
                // (e.g. light_onoff_brightness converters can convert state and brightness)
                continue;
            }
            if (!converter) {
                logger_1.default.error(`No converter available for '${key}' (${(0, json_stable_stringify_without_jsonify_1.default)(message[key])})`);
                continue;
            }
            // If the endpoint_name name is a number, try to map it to a friendlyName
            if (!isNaN(Number(endpointName)) && re.isDevice() && utils_1.default.isEndpoint(localTarget) && re.endpointName(localTarget)) {
                endpointName = re.endpointName(localTarget);
            }
            // Converter didn't return a result, skip
            const entitySettingsKeyValue = entitySettings;
            const meta = {
                endpoint_name: endpointName,
                options: entitySettingsKeyValue,
                message: { ...message },
                logger: logger_1.default,
                device,
                state: entityState,
                membersState,
                mapped: definition,
            };
            // Strip endpoint name from meta.message properties.
            if (endpointName) {
                for (const [key, value] of Object.entries(meta.message)) {
                    if (key.endsWith(endpointName)) {
                        delete meta.message[key];
                        const keyWithoutEndpoint = key.substring(0, key.length - endpointName.length - 1);
                        meta.message[keyWithoutEndpoint] = value;
                    }
                }
            }
            try {
                if (parsedTopic.type === 'set' && converter.convertSet) {
                    logger_1.default.debug(`Publishing '${parsedTopic.type}' '${key}' to '${re.name}'`);
                    const result = await converter.convertSet(localTarget, key, value, meta);
                    const optimistic = !entitySettings.hasOwnProperty('optimistic') || entitySettings.optimistic;
                    if (result && result.state && optimistic) {
                        const msg = result.state;
                        if (endpointName) {
                            for (const key of Object.keys(msg)) {
                                msg[`${key}_${endpointName}`] = msg[key];
                                delete msg[key];
                            }
                        }
                        // filter out attribute listed in filtered_optimistic
                        utils_1.default.filterProperties(entitySettings.filtered_optimistic, msg);
                        addToToPublish(re, msg);
                    }
                    if (result && result.membersState && optimistic) {
                        for (const [ieeeAddr, state] of Object.entries(result.membersState)) {
                            addToToPublish(this.zigbee.resolveEntity(ieeeAddr), state);
                        }
                    }
                    this.legacyRetrieveState(re, converter, result, localTarget, key, meta);
                }
                else if (parsedTopic.type === 'get' && converter.convertGet) {
                    logger_1.default.debug(`Publishing get '${parsedTopic.type}' '${key}' to '${re.name}'`);
                    await converter.convertGet(localTarget, key, meta);
                }
                else {
                    logger_1.default.error(`No converter available for '${parsedTopic.type}' '${key}' (${message[key]})`);
                    continue;
                }
            }
            catch (error) {
                const message = `Publish '${parsedTopic.type}' '${key}' to '${re.name}' failed: '${error}'`;
                logger_1.default.error(message);
                logger_1.default.debug(error.stack);
                await this.legacyLog({ type: `zigbee_publish_error`, message, meta: { friendly_name: re.name } });
            }
            usedConverters[endpointOrGroupID].push(converter);
        }
        for (const [ID, payload] of Object.entries(toPublish)) {
            if (!utils_1.default.objectIsEmpty(payload)) {
                await this.publishEntityState(toPublishEntity[ID], payload);
            }
        }
        const scenesChanged = Object.values(usedConverters).some((cl) => cl.some((c) => c.key?.some((k) => sceneConverterKeys.includes(k))));
        if (scenesChanged) {
            this.eventBus.emitScenesChanged({ entity: re });
        }
    }
}
exports.default = Publish;
__decorate([
    bind_decorator_1.default
], Publish.prototype, "onMQTTMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVibGlzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vcHVibGlzaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLG9FQUFrQztBQUNsQyxrSEFBOEQ7QUFDOUQsZ0VBQWtEO0FBQ2xELGdGQUFrRTtBQUVsRSw2REFBcUM7QUFDckMsMkRBQW1DO0FBQ25DLDREQUFvQztBQUNwQywyREFBNkM7QUFDN0MsMERBQWtDO0FBQ2xDLDREQUFvQztBQUVwQyxJQUFJLGdCQUF3QixDQUFDO0FBQzdCLDZFQUE2RTtBQUN0RSxNQUFNLG9CQUFvQixHQUFHLEdBQVMsRUFBRTtJQUMzQyxnQkFBZ0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSx1Q0FBdUMsQ0FBQyxDQUFDO0FBQzdHLENBQUMsQ0FBQztBQUZXLFFBQUEsb0JBQW9CLHdCQUUvQjtBQUNGLElBQUEsNEJBQW9CLEdBQUUsQ0FBQztBQUV2QixNQUFNLFdBQVcsR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztBQUN2RixNQUFNLGtCQUFrQixHQUFHLENBQUMsYUFBYSxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFFNUcsb0hBQW9IO0FBQ3BILE1BQU0sc0JBQXNCLEdBQUc7SUFDM0IsR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0I7SUFDbkMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxxQkFBcUI7SUFDbEMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsaUNBQWlDO0lBQ3BELEdBQUcsQ0FBQyxRQUFRLENBQUMsaUJBQWlCO0lBQzlCLEdBQUcsQ0FB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