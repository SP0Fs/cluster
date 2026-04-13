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
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importStar(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
const sensorClick = {
    type: 'sensor',
    object_id: 'click',
    mockProperties: [{ property: 'click', value: null }],
    discovery_payload: {
        name: 'Click',
        icon: 'mdi:toggle-switch',
        value_template: '{{ value_json.click }}',
    },
};
const ACCESS_STATE = 0b001;
const ACCESS_SET = 0b010;
const groupSupportedTypes = ['light', 'switch', 'lock', 'cover'];
const defaultStatusTopic = 'homeassistant/status';
const legacyMapping = [
    {
        models: [
            'WXKG01LM',
            'HS1EB/HS1EB-E',
            'ICZB-KPD14S',
            'TERNCY-SD01',
            'TERNCY-PP01',
            'ICZB-KPD18S',
            'E1766',
            'ZWallRemote0',
            'ptvo.switch',
            '2AJZ4KPKEY',
            'ZGRC-KEY-013',
            'HGZB-02S',
            'HGZB-045',
            'HGZB-1S',
            'AV2010/34',
            'IM6001-BTP01',
            'WXKG11LM',
            'WXKG03LM',
            'WXKG02LM_rev1',
            'WXKG02LM_rev2',
            'QBKG04LM',
            'QBKG03LM',
            'QBKG11LM',
            'QBKG21LM',
            'QBKG22LM',
            'WXKG12LM',
            'QBKG12LM',
            'E1743',
        ],
        discovery: sensorClick,
    },
    {
        models: ['ICTC-G-1'],
        discovery: {
            type: 'sensor',
            mockProperties: [{ property: 'brightness', value: null }],
            object_id: 'brightness',
            discovery_payload: {
                name: 'Brightness',
                unit_of_measurement: 'brightness',
                icon: 'mdi:brightness-5',
                value_template: '{{ value_json.brightness }}',
            },
        },
    },
];
const featurePropertyWithoutEndpoint = (feature) => {
    if (feature.endpoint) {
        return feature.property.slice(0, -1 + -1 * feature.endpoint.length);
    }
    else {
        return feature.property;
    }
};
/**
 * This class handles the bridge entity configuration for Home Assistant Discovery.
 */
class Bridge {
    coordinatorIeeeAddress;
    coordinatorType;
    coordinatorFirmwareVersion;
    discoveryEntries;
    options;
    /* eslint-disable brace-style */
    get ID() {
        return this.coordinatorIeeeAddress;
    }
    get name() {
        return 'bridge';
    }
    get hardwareVersion() {
        return this.coordinatorType;
    }
    get firmwareVersion() {
        return this.coordinatorFirmwareVersion;
    }
    get configs() {
        return this.discoveryEntries;
    }
    constructor(ieeeAdress, version, discovery) {
        this.coordinatorIeeeAddress = ieeeAdress;
        this.coordinatorType = version.type;
        /* istanbul ignore next */
        this.coordinatorFirmwareVersion = version.meta.revision ? `${version.meta.revision}` : '';
        this.discoveryEntries = discovery;
        this.options = {
            ID: `bridge_${ieeeAdress}`,
            homeassistant: {
                name: `Zigbee2MQTT Bridge`,
            },
        };
    }
    isDevice() {
        return false;
    }
    isGroup() {
        return false;
    }
}
/**
 * This extensions handles integration with HomeAssistant
 */
class HomeAssistant extends extension_1.default {
    discovered = {};
    discoveryTopic = settings.get().homeassistant.discovery_topic;
    discoveryRegex = new RegExp(`${settings.get().homeassistant.discovery_topic}/(.*)/(.*)/(.*)/config`);
    discoveryRegexWoTopic = new RegExp(`(.*)/(.*)/(.*)/config`);
    statusTopic = settings.get().homeassistant.status_topic;
    entityAttributes = settings.get().homeassistant.legacy_entity_attributes;
    zigbee2MQTTVersion;
    discoveryOrigin;
    bridge;
    bridgeIdentifier;
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);
        if (settings.get().advanced.output === 'attribute') {
            throw new Error('Home Assistant integration is not possible with attribute output!');
        }
        if (settings.get().homeassistant.discovery_topic === settings.get().mqtt.base_topic) {
            throw new Error(`'homeassistant.discovery_topic' cannot not be equal to the 'mqtt.base_topic' (got '${settings.get().mqtt.base_topic}')`);
        }
    }
    async start() {
        if (!settings.get().advanced.cache_state) {
            logger_1.default.warning('In order for Home Assistant integration to work properly set `cache_state: true');
        }
        this.zigbee2MQTTVersion = (await utils_1.default.getZigbee2MQTTVersion(false)).version;
        this.discoveryOrigin = { name: 'Zigbee2MQTT', sw: this.zigbee2MQTTVersion, url: 'https://www.zigbee2mqtt.io' };
        this.bridge = this.getBridgeEntity(await this.zigbee.getCoordinatorVersion());
        this.bridgeIdentifier = this.getDevicePayload(this.bridge).identifiers[0];
        this.eventBus.onEntityRemoved(this, this.onEntityRemoved);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onEntityRenamed(this, this.onEntityRenamed);
        this.eventBus.onPublishEntityState(this, this.onPublishEntityState);
        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);
        this.eventBus.onDeviceAnnounce(this, this.onZigbeeEvent);
        this.eventBus.onDeviceJoined(this, this.onZigbeeEvent);
        this.eventBus.onDeviceInterview(this, this.onZigbeeEvent);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);
        this.eventBus.onScenesChanged(this, this.onScenesChanged);
        this.eventBus.onEntityOptionsChanged(this, async (data) => this.discover(data.entity));
        this.eventBus.onExposesChanged(this, async (data) => this.discover(data.device));
        this.mqtt.subscribe(this.statusTopic);
        this.mqtt.subscribe(defaultStatusTopic);
        /**
         * Prevent unnecessary re-discovery of entities by waiting 5 seconds for retained discovery messages to come in.
         * Any received discovery messages will not be published again.
         * Unsubscribe from the discoveryTopic to prevent receiving our own messages.
         */
        const discoverWait = 5;
        // Discover with `published = false`, this will populate `this.discovered` without publishing the discoveries.
        // This is needed for clearing outdated entries in `this.onMQTTMessage()`
        await this.discover(this.bridge, false);
        for (const e of this.zigbee.devicesAndGroupsIterator(utils_1.default.deviceNotCoordinator)) {
            await this.discover(e, false);
        }
        logger_1.default.debug(`Discovering entities to Home Assistant in ${discoverWait}s`);
        this.mqtt.subscribe(`${this.discoveryTopic}/#`);
        setTimeout(async () => {
            this.mqtt.unsubscribe(`${this.discoveryTopic}/#`);
            logger_1.default.debug(`Discovering entities to Home Assistant`);
            await this.discover(this.bridge);
            for (const e of this.zigbee.devicesAndGroupsIterator(utils_1.default.deviceNotCoordinator)) {
                await this.discover(e);
            }
        }, utils_1.default.seconds(discoverWait));
        // Send availability messages, this is required if the legacy_availability_payload option has been changed.
        this.eventBus.emitPublishAvailability();
    }
    getDiscovered(entity) {
        const ID = typeof entity === 'string' || typeof entity === 'number' ? entity : entity.ID;
        if (!(ID in this.discovered)) {
            this.discovered[ID] = { messages: {}, triggers: new Set(), mockProperties: new Set(), discovered: false };
        }
        return this.discovered[ID];
    }
    exposeToConfig(exposes, entityType, allExposes, definition) {
        // For groups an array of exposes (of the same type) is passed, this is to determine e.g. what features
        // to use for a bulb (e.g. color_xy/color_temp)
        (0, assert_1.default)(entityType === 'group' || exposes.length === 1, 'Multiple exposes for device not allowed');
        const firstExpose = exposes[0];
        (0, assert_1.default)(entityType === 'device' || groupSupportedTypes.includes(firstExpose.type), `Unsupported expose type ${firstExpose.type} for group`);
        const discoveryEntries = [];
        const endpoint = entityType === 'device' ? exposes[0].endpoint : undefined;
        const getProperty = (feature) => (entityType === 'group' ? featurePropertyWithoutEndpoint(feature) : feature.property);
        /* istanbul ignore else */
        if (firstExpose.type === 'light') {
            const hasColorXY = exposes.find((expose) => expose.features.find((e) => e.name === 'color_xy'));
            const hasColorHS = exposes.find((expose) => expose.features.find((e) => e.name === 'color_hs'));
            const hasBrightness = exposes.find((expose) => expose.features.find((e) => e.name === 'brightness'));
            const hasColorTemp = exposes.find((expose) => expose.features.find((e) => e.name === 'color_temp'));
            const state = firstExpose.features.find((f) => f.name === 'state');
            // Prefer HS over XY when at least one of the lights in the group prefers HS over XY.
            // A light prefers HS over XY when HS is earlier in the feature array than HS.
            const preferHS = exposes
                .map((e) => [e.features.findIndex((ee) => ee.name === 'color_xy'), e.features.findIndex((ee) => ee.name === 'color_hs')])
                .filter((d) => d[0] !== -1 && d[1] !== -1 && d[1] < d[0]).length !== 0;
            const discoveryEntry = {
                type: 'light',
                object_id: endpoint ? `light_${endpoint}` : 'light',
                mockProperties: [{ property: state.property, value: null }],
                discovery_payload: {
                    name: endpoint ? utils_1.default.capitalize(endpoint) : null,
                    brightness: !!hasBrightness,
                    schema: 'json',
                    command_topic: true,
                    brightness_scale: 254,
                    command_topic_prefix: endpoint,
                    state_topic_postfix: endpoint,
                },
            };
            const colorModes = [
                hasColorXY && !preferHS ? 'xy' : null,
                (!hasColorXY || preferHS) && hasColorHS ? 'hs' : null,
                hasColorTemp ? 'color_temp' : null,
            ].filter((c) => c);
            if (colorModes.length) {
                discoveryEntry.discovery_payload.supported_color_modes = colorModes;
            }
            if (hasColorTemp) {
                const colorTemps = exposes
                    .map((expose) => expose.features.find((e) => e.name === 'color_temp'))
                    .filter((e) => e)
                    .filter(utils_1.isNumericExposeFeature);
                const max = Math.min(...colorTemps.map((e) => e.value_max));
                const min = Math.max(...colorTemps.map((e) => e.value_min));
                discoveryEntry.discovery_payload.max_mireds = max;
                discoveryEntry.discovery_payload.min_mireds = min;
            }
            const effects = utils_1.default.arrayUnique(utils_1.default.flatten(allExposes
                .filter(utils_1.isEnumExposeFeature)
                .filter((e) => e.name === 'effect')
                .map((e) => e.values)));
            if (effects.length) {
                discoveryEntry.discovery_payload.effect = true;
                discoveryEntry.discovery_payload.effect_list = effects;
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'switch') {
            const state = firstExpose.features.filter(utils_1.isBinaryExposeFeature).find((f) => f.name === 'state');
            const property = getProperty(state);
            const discoveryEntry = {
                type: 'switch',
                object_id: endpoint ? `switch_${endpoint}` : 'switch',
                mockProperties: [{ property: property, value: null }],
                discovery_payload: {
                    name: endpoint ? utils_1.default.capitalize(endpoint) : null,
                    payload_off: state.value_off,
                    payload_on: state.value_on,
                    value_template: `{{ value_json.${property} }}`,
                    command_topic: true,
                    command_topic_prefix: endpoint,
                },
            };
            const different = ['valve_detection', 'window_detection', 'auto_lock', 'away_mode'];
            if (different.includes(property)) {
                discoveryEntry.discovery_payload.name = firstExpose.label;
                discoveryEntry.discovery_payload.command_topic_postfix = property;
                discoveryEntry.discovery_payload.state_off = state.value_off;
                discoveryEntry.discovery_payload.state_on = state.value_on;
                discoveryEntry.object_id = property;
                if (property === 'window_detection') {
                    discoveryEntry.discovery_payload.icon = 'mdi:window-open-variant';
                }
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'climate') {
            const setpointProperties = ['occupied_heating_setpoint', 'current_heating_setpoint'];
            const setpoint = firstExpose.features.filter(utils_1.isNumericExposeFeature).find((f) => setpointProperties.includes(f.name));
            (0, assert_1.default)(setpoint, 'No setpoint found');
            const temperature = firstExpose.features.find((f) => f.name === 'local_temperature');
            (0, assert_1.default)(temperature, 'No temperature found');
            const discoveryEntry = {
                type: 'climate',
                object_id: endpoint ? `climate_${endpoint}` : 'climate',
                mockProperties: [],
                discovery_payload: {
                    name: endpoint ? utils_1.default.capitalize(endpoint) : null,
                    // Static
                    state_topic: false,
                    temperature_unit: 'C',
                    // Setpoint
                    temp_step: setpoint.value_step,
                    min_temp: setpoint.value_min.toString(),
                    max_temp: setpoint.value_max.toString(),
                    // Temperature
                    current_temperature_topic: true,
                    current_temperature_template: `{{ value_json.${temperature.property} }}`,
                    command_topic_prefix: endpoint,
                },
            };
            const mode = firstExpose.features.filter(utils_1.isEnumExposeFeature).find((f) => f.name === 'system_mode');
            if (mode) {
                if (mode.values.includes('sleep')) {
                    // 'sleep' is not supported by Home Assistant, but is valid according to ZCL
                    // TRV that support sleep (e.g. Viessmann) will have it removed from here,
                    // this allows other expose consumers to still use it, e.g. the frontend.
                    mode.values.splice(mode.values.indexOf('sleep'), 1);
                }
                discoveryEntry.discovery_payload.mode_state_topic = true;
                discoveryEntry.discovery_payload.mode_state_template = `{{ value_json.${mode.property} }}`;
                discoveryEntry.discovery_payload.modes = mode.values;
                discoveryEntry.discovery_payload.mode_command_topic = true;
            }
            const state = firstExpose.features.find((f) => f.name === 'running_state');
            if (state) {
                discoveryEntry.mockProperties.push({ property: state.property, value: null });
                discoveryEntry.discovery_payload.action_topic = true;
                discoveryEntry.discovery_payload.action_template =
                    `{% set values = ` +
                        `{None:None,'idle':'idle','heat':'heating','cool':'cooling','fan_only':'fan'}` +
                        ` %}{{ values[value_json.${state.property}] }}`;
            }
            const coolingSetpoint = firstExpose.features.find((f) => f.name === 'occupied_cooling_setpoint');
            if (coolingSetpoint) {
                discoveryEntry.discovery_payload.temperature_low_command_topic = setpoint.name;
                discoveryEntry.discovery_payload.temperature_low_state_template = `{{ value_json.${setpoint.property} }}`;
                discoveryEntry.discovery_payload.temperature_low_state_topic = true;
                discoveryEntry.discovery_payload.temperature_high_command_topic = coolingSetpoint.name;
                discoveryEntry.discovery_payload.temperature_high_state_template = `{{ value_json.${coolingSetpoint.property} }}`;
                discoveryEntry.discovery_payload.temperature_high_state_topic = true;
            }
            else {
                discoveryEntry.discovery_payload.temperature_command_topic = setpoint.name;
                discoveryEntry.discovery_payload.temperature_state_template = `{{ value_json.${setpoint.property} }}`;
                discoveryEntry.discovery_payload.temperature_state_topic = true;
            }
            const fanMode = firstExpose.features.filter(utils_1.isEnumExposeFeature).find((f) => f.name === 'fan_mode');
            if (fanMode) {
                discoveryEntry.discovery_payload.fan_modes = fanMode.values;
                discoveryEntry.discovery_payload.fan_mode_command_topic = true;
                discoveryEntry.discovery_payload.fan_mode_state_template = `{{ value_json.${fanMode.property} }}`;
                discoveryEntry.discovery_payload.fan_mode_state_topic = true;
            }
            const swingMode = firstExpose.features.filter(utils_1.isEnumExposeFeature).find((f) => f.name === 'swing_mode');
            if (swingMode) {
                discoveryEntry.discovery_payload.swing_modes = swingMode.values;
                discoveryEntry.discovery_payload.swing_mode_command_topic = true;
                discoveryEntry.discovery_payload.swing_mode_state_template = `{{ value_json.${swingMode.property} }}`;
                discoveryEntry.discovery_payload.swing_mode_state_topic = true;
            }
            const preset = firstExpose.features.filter(utils_1.isEnumExposeFeature).find((f) => f.name === 'preset');
            if (preset) {
                discoveryEntry.discovery_payload.preset_modes = preset.values;
                discoveryEntry.discovery_payload.preset_mode_command_topic = 'preset';
                discoveryEntry.discovery_payload.preset_mode_value_template = `{{ value_json.${preset.property} }}`;
                discoveryEntry.discovery_payload.preset_mode_state_topic = true;
            }
            const tempCalibration = firstExpose.features.filter(utils_1.isNumericExposeFeature).find((f) => f.name === 'local_temperature_calibration');
            if (tempCalibration) {
                const discoveryEntry = {
                    type: 'number',
                    object_id: endpoint ? `${tempCalibration.name}_${endpoint}` : `${tempCalibration.name}`,
                    mockProperties: [{ property: tempCalibration.property, value: null }],
                    discovery_payload: {
                        name: endpoint ? `${tempCalibration.label} ${endpoint}` : tempCalibration.label,
                        value_template: `{{ value_json.${tempCalibration.property} }}`,
                        command_topic: true,
                        command_topic_prefix: endpoint,
                        command_topic_postfix: tempCalibration.property,
                        device_class: 'temperature',
                        entity_category: 'config',
                        icon: 'mdi:math-compass',
                        ...(tempCalibration.unit && { unit_of_measurement: tempCalibration.unit }),
                    },
                };
                if (tempCalibration.value_min != null)
                    discoveryEntry.discovery_payload.min = tempCalibration.value_min;
                if (tempCalibration.value_max != null)
                    discoveryEntry.discovery_payload.max = tempCalibration.value_max;
                if (tempCalibration.value_step != null) {
                    discoveryEntry.discovery_payload.step = tempCalibration.value_step;
                }
                discoveryEntries.push(discoveryEntry);
            }
            const piHeatingDemand = firstExpose.features.filter(utils_1.isNumericExposeFeature).find((f) => f.name === 'pi_heating_demand');
            if (piHeatingDemand) {
                const discoveryEntry = {
                    type: 'sensor',
                    object_id: endpoint ? `${piHeatingDemand.name}_${endpoint}` : `${piHeatingDemand.name}`,
                    mockProperties: [{ property: piHeatingDemand.property, value: null }],
                    discovery_payload: {
                        name: endpoint ? `${piHeatingDemand.label} ${endpoint}` : piHeatingDemand.label,
                        value_template: `{{ value_json.${piHeatingDemand.property} }}`,
                        ...(piHeatingDemand.unit && { unit_of_measurement: piHeatingDemand.unit }),
                        entity_category: 'diagnostic',
                        icon: 'mdi:radiator',
                    },
                };
                discoveryEntries.push(discoveryEntry);
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'lock') {
            (0, assert_1.default)(!endpoint, `Endpoint not supported for lock type`);
            const state = firstExpose.features.filter(utils_1.isBinaryExposeFeature).find((f) => f.name === 'state');
            (0, assert_1.default)(state, 'No state found');
            const discoveryEntry = {
                type: 'lock',
                object_id: 'lock',
                mockProperties: [{ property: state.property, value: null }],
                discovery_payload: {
                    name: null,
                    command_topic: true,
                    value_template: `{{ value_json.${state.property} }}`,
                },
            };
            if (state.property === 'keypad_lockout') {
                // deprecated: keypad_lockout is messy, but changing is breaking
                discoveryEntry.discovery_payload.name = firstExpose.label;
                discoveryEntry.discovery_payload.payload_lock = state.value_on;
                discoveryEntry.discovery_payload.payload_unlock = state.value_off;
                discoveryEntry.discovery_payload.state_topic = true;
                discoveryEntry.object_id = 'keypad_lock';
            }
            else if (state.property === 'child_lock') {
                // deprecated: child_lock is messy, but changing is breaking
                discoveryEntry.discovery_payload.name = firstExpose.label;
                discoveryEntry.discovery_payload.payload_lock = state.value_on;
                discoveryEntry.discovery_payload.payload_unlock = state.value_off;
                discoveryEntry.discovery_payload.state_locked = 'LOCK';
                discoveryEntry.discovery_payload.state_unlocked = 'UNLOCK';
                discoveryEntry.discovery_payload.state_topic = true;
                discoveryEntry.object_id = 'child_lock';
            }
            else {
                discoveryEntry.discovery_payload.state_locked = state.value_on;
                discoveryEntry.discovery_payload.state_unlocked = state.value_off;
            }
            if (state.property !== 'state') {
                discoveryEntry.discovery_payload.command_topic_postfix = state.property;
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'cover') {
            const state = exposes.find((expose) => expose.features.find((e) => e.name === 'state'))?.features.find((f) => f.name === 'state');
            const position = exposes
                .find((expose) => expose.features.find((e) => e.name === 'position'))
                ?.features.find((f) => f.name === 'position');
            const tilt = exposes.find((expose) => expose.features.find((e) => e.name === 'tilt'))?.features.find((f) => f.name === 'tilt');
            const motorState = allExposes
                ?.filter(utils_1.isEnumExposeFeature)
                .find((e) => ['motor_state', 'moving'].includes(e.name) && e.access === ACCESS_STATE);
            const running = allExposes?.find((e) => e.type === 'binary' && e.name === 'running');
            const discoveryEntry = {
                type: 'cover',
                mockProperties: [{ property: state.property, value: null }],
                object_id: endpoint ? `cover_${endpoint}` : 'cover',
                discovery_payload: {
                    name: endpoint ? utils_1.default.capitalize(endpoint) : null,
                    command_topic_prefix: endpoint,
                    command_topic: true,
                    state_topic: true,
                    state_topic_postfix: endpoint,
                },
            };
            // If curtains have `running` property, use this in discovery.
            // The movement direction is calculated (assumed) in this case.
            if (running) {
                discoveryEntry.discovery_payload.value_template =
                    `{% if "${running.property}" in value_json ` +
                        `and value_json.${running.property} %} {% if value_json.${position.property} > 0 %} closing ` +
                        `{% else %} opening {% endif %} {% else %} stopped {% endif %}`;
            }
            // If curtains have `motor_state` or `moving` property, lookup for possible
            // state names to detect movement direction and use this in discovery.
            if (motorState) {
                const openingLookup = ['opening', 'open', 'forward', 'up', 'rising'];
                const closingLookup = ['closing', 'close', 'backward', 'back', 'reverse', 'down', 'declining'];
                const stoppedLookup = ['stopped', 'stop', 'pause', 'paused'];
                const openingState = motorState.values.find((s) => openingLookup.includes(s.toString().toLowerCase()));
                const closingState = motorState.values.find((s) => closingLookup.includes(s.toString().toLowerCase()));
                const stoppedState = motorState.values.find((s) => stoppedLookup.includes(s.toString().toLowerCase()));
                if (openingState && closingState && stoppedState) {
                    discoveryEntry.discovery_payload.state_opening = openingState;
                    discoveryEntry.discovery_payload.state_closing = closingState;
                    discoveryEntry.discovery_payload.state_stopped = stoppedState;
                    discoveryEntry.discovery_payload.value_template =
                        `{% if "${motorState.property}" in value_json ` +
                            `and value_json.${motorState.property} %} {{ value_json.${motorState.property} }} {% else %} ` +
                            `${stoppedState} {% endif %}`;
                }
            }
            // If curtains do not have `running`, `motor_state` or `moving` properties.
            if (!discoveryEntry.discovery_payload.value_template) {
                discoveryEntry.discovery_payload.value_template = `{{ value_json.${featurePropertyWithoutEndpoint(state)} }}`;
                discoveryEntry.discovery_payload.state_open = 'OPEN';
                discoveryEntry.discovery_payload.state_closed = 'CLOSE';
                discoveryEntry.discovery_payload.state_stopped = 'STOP';
            }
            if (!position && !tilt) {
                discoveryEntry.discovery_payload.optimistic = true;
            }
            if (position) {
                discoveryEntry.discovery_payload = {
                    ...discoveryEntry.discovery_payload,
                    position_template: `{{ value_json.${featurePropertyWithoutEndpoint(position)} }}`,
                    set_position_template: `{ "${getProperty(position)}": {{ position }} }`,
                    set_position_topic: true,
                    position_topic: true,
                };
            }
            if (tilt) {
                discoveryEntry.discovery_payload = {
                    ...discoveryEntry.discovery_payload,
                    tilt_command_topic: true,
                    tilt_status_topic: true,
                    tilt_status_template: `{{ value_json.${featurePropertyWithoutEndpoint(tilt)} }}`,
                };
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'fan') {
            (0, assert_1.default)(!endpoint, `Endpoint not supported for fan type`);
            const discoveryEntry = {
                type: 'fan',
                object_id: 'fan',
                mockProperties: [{ property: 'fan_state', value: null }],
                discovery_payload: {
                    name: null,
                    state_topic: true,
                    state_value_template: '{{ value_json.fan_state }}',
                    command_topic: true,
                    command_topic_postfix: 'fan_state',
                },
            };
            const speed = firstExpose.features.filter(utils_1.isEnumExposeFeature).find((e) => e.name === 'mode');
            if (speed) {
                // A fan entity in Home Assistant 2021.3 and above may have a speed,
                // controlled by a percentage from 1 to 100, and/or non-speed presets.
                // The MQTT Fan integration allows the speed percentage to be mapped
                // to a narrower range of speeds (e.g. 1-3), and for these speeds to be
                // translated to and from MQTT messages via templates.
                //
                // For the fixed fan modes in ZCL hvacFanCtrl, we model speeds "low",
                // "medium", and "high" as three speeds covering the full percentage
                // range as done in Home Assistant's zigpy fan integration, plus
                // presets "on", "auto" and "smart" to cover the remaining modes in
                // ZCL. This supports a generic ZCL HVAC Fan Control fan. "Off" is
                // always a valid speed.
                let speeds = ['off'].concat(['low', 'medium', 'high', '1', '2', '3', '4', '5', '6', '7', '8', '9'].filter((s) => speed.values.includes(s)));
                let presets = ['on', 'auto', 'smart'].filter((s) => speed.values.includes(s));
                if (['99432'].includes(definition.model)) {
                    // The Hampton Bay 99432 fan implements 4 speeds using the ZCL
                    // hvacFanCtrl values `low`, `medium`, `high`, and `on`, and
                    // 1 preset called "Comfort Breeze" using the ZCL value `smart`.
                    // ZCL value `auto` is unused.
                    speeds = ['off', 'low', 'medium', 'high', 'on'];
                    presets = ['smart'];
                }
                const allowed = [...speeds, ...presets];
                speed.values.forEach((s) => (0, assert_1.default)(allowed.includes(s.toString())));
                const percentValues = speeds.map((s, i) => `'${s}':${i}`).join(', ');
                const percentCommands = speeds.map((s, i) => `${i}:'${s}'`).join(', ');
                const presetList = presets.map((s) => `'${s}'`).join(', ');
                discoveryEntry.discovery_payload.percentage_state_topic = true;
                discoveryEntry.discovery_payload.percentage_command_topic = true;
                discoveryEntry.discovery_payload.percentage_value_template = `{{ {${percentValues}}[value_json.${speed.property}] | default('None') }}`;
                discoveryEntry.discovery_payload.percentage_command_template = `{{ {${percentCommands}}[value] | default('') }}`;
                discoveryEntry.discovery_payload.speed_range_min = 1;
                discoveryEntry.discovery_payload.speed_range_max = speeds.length - 1;
                (0, assert_1.default)(presets.length !== 0);
                discoveryEntry.discovery_payload.preset_mode_state_topic = true;
                discoveryEntry.discovery_payload.preset_mode_command_topic = 'fan_mode';
                discoveryEntry.discovery_payload.preset_mode_value_template = `{{ value_json.${speed.property} if value_json.${speed.property} in [${presetList}] else 'None' | default('None') }}`;
                discoveryEntry.discovery_payload.preset_modes = presets;
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if ((0, utils_1.isBinaryExposeFeature)(firstExpose)) {
            const lookup = {
                activity_led_indicator: { icon: 'mdi:led-on' },
                auto_off: { icon: 'mdi:flash-auto' },
                battery_low: { entity_category: 'diagnostic', device_class: 'battery' },
                button_lock: { entity_category: 'config', icon: 'mdi:lock' },
                calibration: { entity_category: 'config', icon: 'mdi:progress-wrench' },
                capabilities_configurable_curve: { entity_category: 'diagnostic', icon: 'mdi:tune' },
                capabilities_forward_phase_control: { entity_category: 'diagnostic', icon: 'mdi:tune' },
                capabilities_overload_detection: { entity_category: 'diagnostic', icon: 'mdi:tune' },
                capabilities_reactance_discriminator: { entity_category: 'diagnostic', icon: 'mdi:tune' },
                capabilities_reverse_phase_control: { entity_category: 'diagnostic', icon: 'mdi:tune' },
                carbon_monoxide: { device_class: 'carbon_monoxide' },
                card: { entity_category: 'config', icon: 'mdi:clipboard-check' },
                child_lock: { entity_category: 'config', icon: 'mdi:account-lock' },
                color_sync: { entity_category: 'config', icon: 'mdi:sync-circle' },
                consumer_connected: { device_class: 'plug' },
                contact: { device_class: 'door' },
                garage_door_contact: { device_class: 'garage_door', payload_on: false, payload_off: true },
                eco_mode: { entity_category: 'config', icon: 'mdi:leaf' },
                expose_pin: { entity_category: 'config', icon: 'mdi:pin' },
                flip_indicator_light: { entity_category: 'config', icon: 'mdi:arrow-left-right' },
                gas: { device_class: 'gas' },
                indicator_mode: { entity_category: 'config', icon: 'mdi:led-on' },
                invert_cover: { entity_category: 'config', icon: 'mdi:arrow-left-right' },
                led_disabled_night: { entity_category: 'config', icon: 'mdi:led-off' },
                led_indication: { entity_category: 'config', icon: 'mdi:led-on' },
                led_enable: { entity_category: 'config', icon: 'mdi:led-on' },
                legacy: { entity_category: 'config', icon: 'mdi:cog' },
                motor_reversal: { entity_category: 'config', icon: 'mdi:arrow-left-right' },
                moving: { device_class: 'moving' },
                no_position_support: { entity_category: 'config', icon: 'mdi:minus-circle-outline' },
                noise_detected: { device_class: 'sound' },
                occupancy: { device_class: 'occupancy' },
                power_outage_memory: { entity_category: 'config', icon: 'mdi:memory' },
                presence: { device_class: 'presence' },
                setup: { device_class: 'running' },
                smoke: { device_class: 'smoke' },
                sos: { device_class: 'safety' },
                schedule: { icon: 'mdi:calendar' },
                status_capacitive_load: { entity_category: 'diagnostic', icon: 'mdi:tune' },
                status_forward_phase_control: { entity_category: 'diagnostic', icon: 'mdi:tune' },
                status_inductive_load: { entity_category: 'diagnostic', icon: 'mdi:tune' },
                status_overload: { entity_category: 'diagnostic', icon: 'mdi:tune' },
                status_reverse_phase_control: { entity_category: 'diagnostic', icon: 'mdi:tune' },
                tamper: { device_class: 'tamper' },
                temperature_scale: { entity_category: 'config', icon: 'mdi:temperature-celsius' },
                test: { entity_category: 'diagnostic', icon: 'mdi:test-tube' },
                th_heater: { icon: 'mdi:heat-wave' },
                trigger_indicator: { icon: 'mdi:led-on' },
                valve_alarm: { device_class: 'problem' },
                valve_detection: { icon: 'mdi:pipe-valve' },
                valve_state: { device_class: 'opening' },
                vibration: { device_class: 'vibration' },
                water_leak: { device_class: 'moisture' },
                window: { device_class: 'window' },
                window_detection: { icon: 'mdi:window-open-variant' },
                window_open: { device_class: 'window' },
            };
            /**
             * If Z2M binary attribute has SET access then expose it as `switch` in HA
             * There is also a check on the values for typeof boolean to prevent invalid values and commands
             * silently failing - commands work fine but some devices won't reject unexpected values.
             * https://github.com/Koenkk/zigbee2mqtt/issues/7740
             */
            if (firstExpose.access & ACCESS_SET) {
                const discoveryEntry = {
                    type: 'switch',
                    mockProperties: [{ property: firstExpose.property, value: null }],
                    object_id: endpoint ? `switch_${firstExpose.name}_${endpoint}` : `switch_${firstExpose.name}`,
                    discovery_payload: {
                        name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                        value_template: typeof firstExpose.value_on === 'boolean'
                            ? `{% if value_json.${firstExpose.property} %} true {% else %} false {% endif %}`
                            : `{{ value_json.${firstExpose.property} }}`,
                        payload_on: firstExpose.value_on.toString(),
                        payload_off: firstExpose.value_off.toString(),
                        command_topic: true,
                        command_topic_prefix: endpoint,
                        command_topic_postfix: firstExpose.property,
                        ...(lookup[firstExpose.name] || {}),
                    },
                };
                discoveryEntries.push(discoveryEntry);
            }
            else {
                const discoveryEntry = {
                    type: 'binary_sensor',
                    object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                    mockProperties: [{ property: firstExpose.property, value: null }],
                    discovery_payload: {
                        name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        payload_on: firstExpose.value_on,
                        payload_off: firstExpose.value_off,
                        ...(lookup[firstExpose.name] || {}),
                    },
                };
                discoveryEntries.push(discoveryEntry);
            }
        }
        else if ((0, utils_1.isNumericExposeFeature)(firstExpose)) {
            const lookup = {
                ac_frequency: { device_class: 'frequency', enabled_by_default: false, entity_category: 'diagnostic', state_class: 'measurement' },
                action_duration: { icon: 'mdi:timer', device_class: 'duration' },
                alarm_humidity_max: { device_class: 'humidity', entity_category: 'config', icon: 'mdi:water-plus' },
                alarm_humidity_min: { device_class: 'humidity', entity_category: 'config', icon: 'mdi:water-minus' },
                alarm_temperature_max: { device_class: 'temperature', entity_category: 'config', icon: 'mdi:thermometer-high' },
                alarm_temperature_min: { device_class: 'temperature', entity_category: 'config', icon: 'mdi:thermometer-low' },
                angle: { icon: 'angle-acute' },
                angle_axis: { icon: 'angle-acute' },
                aqi: { device_class: 'aqi', state_class: 'measurement' },
                auto_relock_time: { entity_category: 'config', icon: 'mdi:timer' },
                away_preset_days: { entity_category: 'config', icon: 'mdi:timer' },
                away_preset_temperature: { entity_category: 'config', icon: 'mdi:thermometer' },
                ballast_maximum_level: { entity_category: 'config' },
                ballast_minimum_level: { entity_category: 'config' },
                ballast_physical_maximum_level: { entity_category: 'diagnostic' },
                ballast_physical_minimum_level: { entity_category: 'diagnostic' },
                battery: { device_class: 'battery', state_class: 'measurement' },
                battery2: { device_class: 'battery', entity_category: 'diagnostic', state_class: 'measurement' },
                battery_voltage: { device_class: 'voltage', entity_category: 'diagnostic', state_class: 'measurement', enabled_by_default: true },
                boost_heating_countdown: { device_class: 'duration' },
                boost_heating_countdown_time_set: { entity_category: 'config', icon: 'mdi:timer' },
                boost_time: { entity_category: 'config', icon: 'mdi:timer' },
                calibration: { entity_category: 'config', icon: 'mdi:wrench-clock' },
                calibration_time: { entity_category: 'config', icon: 'mdi:wrench-clock' },
                co2: { device_class: 'carbon_dioxide', state_class: 'measurement' },
                comfort_temperature: { entity_category: 'config', icon: 'mdi:thermometer' },
                cpu_temperature: {
                    device_class: 'temperature',
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                cube_side: { icon: 'mdi:cube' },
                current: {
                    device_class: 'current',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                current_phase_b: {
                    device_class: 'current',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                current_phase_c: {
                    device_class: 'current',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                deadzone_temperature: { entity_category: 'config', icon: 'mdi:thermometer' },
                detection_interval: { icon: 'mdi:timer' },
                device_temperature: {
                    device_class: 'temperature',
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                duration: { entity_category: 'config', icon: 'mdi:timer' },
                eco2: { device_class: 'carbon_dioxide', state_class: 'measurement' },
                eco_temperature: { entity_category: 'config', icon: 'mdi:thermometer' },
                energy: { device_class: 'energy', state_class: 'total_increasing' },
                external_temperature_input: { icon: 'mdi:thermometer' },
                formaldehyd: { state_class: 'measurement' },
                gas_density: { icon: 'mdi:google-circles-communities', state_class: 'measurement' },
                hcho: { icon: 'mdi:air-filter', state_class: 'measurement' },
                humidity: { device_class: 'humidity', state_class: 'measurement' },
                humidity_calibration: { entity_category: 'config', icon: 'mdi:wrench-clock' },
                humidity_max: { entity_category: 'config', icon: 'mdi:water-percent' },
                humidity_min: { entity_category: 'config', icon: 'mdi:water-percent' },
                illuminance_calibration: { entity_category: 'config', icon: 'mdi:wrench-clock' },
                illuminance_lux: { device_class: 'illuminance', state_class: 'measurement' },
                illuminance: { device_class: 'illuminance', enabled_by_default: false, state_class: 'measurement' },
                linkquality: {
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    icon: 'mdi:signal',
                    state_class: 'measurement',
                },
                local_temperature: { device_class: 'temperature', state_class: 'measurement' },
                max_temperature: { entity_category: 'config', icon: 'mdi:thermometer-high' },
                max_temperature_limit: { entity_category: 'config', icon: 'mdi:thermometer-high' },
                min_temperature_limit: { entity_category: 'config', icon: 'mdi:thermometer-low' },
                min_temperature: { entity_category: 'config', icon: 'mdi:thermometer-low' },
                minimum_on_level: { entity_category: 'config' },
                measurement_poll_interval: { entity_category: 'config', icon: 'mdi:clock-out' },
                noise: { device_class: 'sound_pressure', state_class: 'measurement' },
                noise_detect_level: { icon: 'mdi:volume-equal' },
                noise_timeout: { icon: 'mdi:timer' },
                occupancy_level: { icon: 'mdi:motion-sensor' },
                occupancy_sensitivity: { icon: 'mdi:motion-sensor' },
                occupancy_timeout: { entity_category: 'config', icon: 'mdi:timer' },
                overload_protection: { icon: 'mdi:flash' },
                pm10: { device_class: 'pm10', state_class: 'measurement' },
                pm25: { device_class: 'pm25', state_class: 'measurement' },
                people: { state_class: 'measurement', icon: 'mdi:account-multiple' },
                position: { icon: 'mdi:valve', state_class: 'measurement' },
                power: { device_class: 'power', entity_category: 'diagnostic', state_class: 'measurement' },
                power_factor: { device_class: 'power_factor', enabled_by_default: false, entity_category: 'diagnostic', state_class: 'measurement' },
                power_outage_count: { icon: 'mdi:counter', enabled_by_default: false },
                precision: { entity_category: 'config', icon: 'mdi:decimal-comma-increase' },
                pressure: { device_class: 'atmospheric_pressure', state_class: 'measurement' },
                presence_timeout: { entity_category: 'config', icon: 'mdi:timer' },
                reporting_time: { entity_category: 'config', icon: 'mdi:clock-time-one-outline' },
                requested_brightness_level: {
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    icon: 'mdi:brightness-5',
                },
                requested_brightness_percent: {
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    icon: 'mdi:brightness-5',
                },
                smoke_density: { icon: 'mdi:google-circles-communities', state_class: 'measurement' },
                soil_moisture: { device_class: 'moisture', state_class: 'measurement' },
                temperature: { device_class: 'temperature', state_class: 'measurement' },
                temperature_calibration: { entity_category: 'config', icon: 'mdi:wrench-clock' },
                temperature_max: { entity_category: 'config', icon: 'mdi:thermometer-plus' },
                temperature_min: { entity_category: 'config', icon: 'mdi:thermometer-minus' },
                temperature_offset: { icon: 'mdi:thermometer-lines' },
                transition: { entity_category: 'config', icon: 'mdi:transition' },
                trigger_count: { icon: 'mdi:counter', enabled_by_default: false },
                voc: { device_class: 'volatile_organic_compounds', state_class: 'measurement' },
                voc_index: { state_class: 'measurement', icon: 'mdi:molecule' },
                voc_parts: { device_class: 'volatile_organic_compounds_parts', state_class: 'measurement' },
                vibration_timeout: { entity_category: 'config', icon: 'mdi:timer' },
                voltage: {
                    device_class: 'voltage',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                voltage_phase_b: {
                    device_class: 'voltage',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                voltage_phase_c: {
                    device_class: 'voltage',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                water_consumed: {
                    device_class: 'water',
                    state_class: 'total_increasing',
                },
                x_axis: { icon: 'mdi:axis-x-arrow' },
                y_axis: { icon: 'mdi:axis-y-arrow' },
                z_axis: { icon: 'mdi:axis-z-arrow' },
            };
            const extraAttrs = {};
            // If a variable includes Wh, mark it as energy
            if (firstExpose.unit && ['Wh', 'kWh'].includes(firstExpose.unit)) {
                Object.assign(extraAttrs, { device_class: 'energy', state_class: 'total_increasing' });
            }
            const allowsSet = firstExpose.access & ACCESS_SET;
            let key = firstExpose.name;
            // Home Assistant uses a different voc device_class for µg/m³ versus ppb or ppm.
            if (firstExpose.name === 'voc' && firstExpose.unit && ['ppb', 'ppm'].includes(firstExpose.unit)) {
                key = 'voc_parts';
            }
            const discoveryEntry = {
                type: 'sensor',
                object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                mockProperties: [{ property: firstExpose.property, value: null }],
                discovery_payload: {
                    name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                    value_template: `{{ value_json.${firstExpose.property} }}`,
                    enabled_by_default: !allowsSet,
                    ...(firstExpose.unit && { unit_of_measurement: firstExpose.unit }),
                    ...lookup[key],
                    ...extraAttrs,
                },
            };
            // When a device_class is set, unit_of_measurement must be set, otherwise warnings are generated.
            // https://github.com/Koenkk/zigbee2mqtt/issues/15958#issuecomment-1377483202
            if (discoveryEntry.discovery_payload.device_class && !discoveryEntry.discovery_payload.unit_of_measurement) {
                delete discoveryEntry.discovery_payload.device_class;
            }
            // entity_category config is not allowed for sensors
            // https://github.com/Koenkk/zigbee2mqtt/issues/20252
            if (discoveryEntry.discovery_payload.entity_category === 'config') {
                discoveryEntry.discovery_payload.entity_category = 'diagnostic';
            }
            discoveryEntries.push(discoveryEntry);
            /**
             * If numeric attribute has SET access then expose as SELECT entity too.
             * Note: currently both sensor and number are discovered, this is to avoid
             * breaking changes for sensors already existing in HA (legacy).
             */
            if (allowsSet) {
                const discoveryEntry = {
                    type: 'number',
                    object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                    mockProperties: [{ property: firstExpose.property, value: null }],
                    discovery_payload: {
                        name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        command_topic: true,
                        command_topic_prefix: endpoint,
                        command_topic_postfix: firstExpose.property,
                        ...(firstExpose.unit && { unit_of_measurement: firstExpose.unit }),
                        ...(firstExpose.value_step && { step: firstExpose.value_step }),
                        ...lookup[firstExpose.name],
                    },
                };
                if (lookup[firstExpose.name]?.device_class === 'temperature') {
                    discoveryEntry.discovery_payload.device_class = lookup[firstExpose.name]?.device_class;
                }
                else {
                    delete discoveryEntry.discovery_payload.device_class;
                }
                if (firstExpose.value_min != null)
                    discoveryEntry.discovery_payload.min = firstExpose.value_min;
                if (firstExpose.value_max != null)
                    discoveryEntry.discovery_payload.max = firstExpose.value_max;
                discoveryEntries.push(discoveryEntry);
            }
        }
        else if ((0, utils_1.isEnumExposeFeature)(firstExpose)) {
            const lookup = {
                action: { icon: 'mdi:gesture-double-tap' },
                alarm_humidity: { entity_category: 'config', icon: 'mdi:water-percent-alert' },
                alarm_temperature: { entity_category: 'config', icon: 'mdi:thermometer-alert' },
                backlight_auto_dim: { entity_category: 'config', icon: 'mdi:brightness-auto' },
                backlight_mode: { entity_category: 'config', icon: 'mdi:lightbulb' },
                calibrate: { icon: 'mdi:tune' },
                color_power_on_behavior: { entity_category: 'config', icon: 'mdi:palette' },
                control_mode: { entity_category: 'config', icon: 'mdi:tune' },
                device_mode: { entity_category: 'config', icon: 'mdi:tune' },
                effect: { enabled_by_default: false, icon: 'mdi:palette' },
                force: { entity_category: 'config', icon: 'mdi:valve' },
                keep_time: { entity_category: 'config', icon: 'mdi:av-timer' },
                identify: { device_class: 'identify' },
                keypad_lockout: { entity_category: 'config', icon: 'mdi:lock' },
                load_detection_mode: { entity_category: 'config', icon: 'mdi:tune' },
                load_dimmable: { entity_category: 'config', icon: 'mdi:chart-bell-curve' },
                load_type: { entity_category: 'config', icon: 'mdi:led-on' },
                melody: { entity_category: 'config', icon: 'mdi:music-note' },
                mode_phase_control: { entity_category: 'config', icon: 'mdi:tune' },
                mode: { entity_category: 'config', icon: 'mdi:tune' },
                mode_switch: { icon: 'mdi:tune' },
                motion_sensitivity: { entity_category: 'config', icon: 'mdi:tune' },
                operation_mode: { entity_category: 'config', icon: 'mdi:tune' },
                power_on_behavior: { entity_category: 'config', icon: 'mdi:power-settings' },
                power_outage_memory: { entity_category: 'config', icon: 'mdi:power-settings' },
                power_supply_mode: { entity_category: 'config', icon: 'mdi:power-settings' },
                power_type: { entity_category: 'config', icon: 'mdi:lightning-bolt-circle' },
                restart: { device_class: 'restart' },
                sensitivity: { entity_category: 'config', icon: 'mdi:tune' },
                sensor: { icon: 'mdi:tune' },
                sensors_type: { entity_category: 'config', icon: 'mdi:tune' },
                sound_volume: { entity_category: 'config', icon: 'mdi:volume-high' },
                status: { icon: 'mdi:state-machine' },
                switch_type: { entity_category: 'config', icon: 'mdi:tune' },
                temperature_display_mode: { entity_category: 'config', icon: 'mdi:thermometer' },
                temperature_sensor_select: { entity_category: 'config', icon: 'mdi:home-thermometer' },
                thermostat_unit: { entity_category: 'config', icon: 'mdi:thermometer' },
                update: { device_class: 'update' },
                volume: { entity_category: 'config', icon: 'mdi: volume-high' },
                week: { entity_category: 'config', icon: 'mdi:calendar-clock' },
            };
            const valueTemplate = firstExpose.access & ACCESS_STATE ? `{{ value_json.${firstExpose.property} }}` : undefined;
            if (firstExpose.access & ACCESS_STATE) {
                discoveryEntries.push({
                    type: 'sensor',
                    object_id: firstExpose.property,
                    mockProperties: [{ property: firstExpose.property, value: null }],
                    discovery_payload: {
                        name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                        value_template: valueTemplate,
                        enabled_by_default: !(firstExpose.access & ACCESS_SET),
                        ...lookup[firstExpose.name],
                    },
                });
            }
            /**
             * If enum attribute has SET access then expose as SELECT entity too.
             * Note: currently both sensor and select are discovered, this is to avoid
             * breaking changes for sensors already existing in HA (legacy).
             */
            if (firstExpose.access & ACCESS_SET) {
                discoveryEntries.push({
                    type: 'select',
                    object_id: firstExpose.property,
                    mockProperties: [], // Already mocked above in case access STATE is supported
                    discovery_payload: {
                        name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                        value_template: valueTemplate,
                        state_topic: !!(firstExpose.access & ACCESS_STATE),
                        command_topic_prefix: endpoint,
                        command_topic: true,
                        command_topic_postfix: firstExpose.property,
                        options: firstExpose.values.map((v) => v.toString()),
                        enabled_by_default: firstExpose.values.length !== 1, // hide if button is exposed
                        ...lookup[firstExpose.name],
                    },
                });
            }
            /**
             * If enum has only item and only supports SET then expose as button entity.
             * Note: select entity is hidden by default to avoid breaking changes
             * for selects already existing in HA (legacy).
             */
            if (firstExpose.access & ACCESS_SET && firstExpose.values.length === 1) {
                discoveryEntries.push({
                    type: 'button',
                    object_id: firstExpose.property,
                    mockProperties: [],
                    discovery_payload: {
                        name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                        state_topic: false,
                        command_topic_prefix: endpoint,
                        command_topic: true,
                        command_topic_postfix: firstExpose.property,
                        payload_press: firstExpose.values[0].toString(),
                        ...lookup[firstExpose.name],
                    },
                });
            }
        }
        else if (firstExpose.type === 'text' || firstExpose.type === 'composite' || firstExpose.type === 'list') {
            // Deprecated: remove text sensor
            const settableText = firstExpose.type === 'text' && firstExpose.access & ACCESS_SET;
            const lookup = {
                action: { icon: 'mdi:gesture-double-tap' },
                color_options: { icon: 'mdi:palette' },
                level_config: { entity_category: 'diagnostic' },
                programming_mode: { icon: 'mdi:calendar-clock' },
                schedule_settings: { icon: 'mdi:calendar-clock' },
            };
            if (firstExpose.access & ACCESS_STATE) {
                const discoveryEntry = {
                    type: 'sensor',
                    object_id: firstExpose.property,
                    mockProperties: [{ property: firstExpose.property, value: null }],
                    discovery_payload: {
                        name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                        // Truncate text if it's too long
                        // https://github.com/Koenkk/zigbee2mqtt/issues/23199
                        value_template: `{{ value_json.${firstExpose.property}|default('',True) | truncate(254, True, '', 0) }}`,
                        enabled_by_default: !settableText,
                        ...lookup[firstExpose.name],
                    },
                };
                discoveryEntries.push(discoveryEntry);
            }
            if (settableText) {
                discoveryEntries.push({
                    type: 'text',
                    object_id: firstExpose.property,
                    mockProperties: [], // Already mocked above in case access STATE is supported
                    discovery_payload: {
                        name: endpoint ? `${firstExpose.label} ${endpoint}` : firstExpose.label,
                        state_topic: firstExpose.access & ACCESS_STATE,
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        command_topic_prefix: endpoint,
                        command_topic: true,
                        command_topic_postfix: firstExpose.property,
                        ...lookup[firstExpose.name],
                    },
                });
            }
        }
        else {
            throw new Error(`Unsupported exposes type: '${firstExpose.type}'`);
        }
        // Exposes with category 'config' or 'diagnostic' are always added to the respective category.
        // This takes precedence over definitions in this file.
        if (firstExpose.category === 'config') {
            discoveryEntries.forEach((d) => (d.discovery_payload.entity_category = 'config'));
        }
        else if (firstExpose.category === 'diagnostic') {
            discoveryEntries.forEach((d) => (d.discovery_payload.entity_category = 'diagnostic'));
        }
        discoveryEntries.forEach((d) => {
            // If a sensor has entity category `config`, then change
            // it to `diagnostic`. Sensors have no input, so can't be configured.
            // https://github.com/Koenkk/zigbee2mqtt/pull/19474
            if (['binary_sensor', 'sensor'].includes(d.type) && d.discovery_payload.entity_category === 'config') {
                d.discovery_payload.entity_category = 'diagnostic';
            }
        });
        discoveryEntries.forEach((d) => {
            // Let Home Assistant generate entity name when device_class is present
            if (d.discovery_payload.device_class) {
                delete d.discovery_payload.name;
            }
        });
        return discoveryEntries;
    }
    async onEntityRemoved(data) {
        logger_1.default.debug(`Clearing Home Assistant discovery for '${data.name}'`);
        const discovered = this.getDiscovered(data.id);
        for (const topic of Object.keys(discovered.messages)) {
            await this.mqtt.publish(topic, null, { retain: true, qos: 1 }, this.discoveryTopic, false, false);
        }
        delete this.discovered[data.id];
    }
    async onGroupMembersChanged(data) {
        await this.discover(data.group);
    }
    async onPublishEntityState(data) {
        /**
         * In case we deal with a lightEndpoint configuration Zigbee2MQTT publishes
         * e.g. {state_l1: ON, brightness_l1: 250} to zigbee2mqtt/mydevice.
         * As the Home Assistant MQTT JSON light cannot be configured to use state_l1/brightness_l1
         * as the state variables, the state topic is set to zigbee2mqtt/mydevice/l1.
         * Here we retrieve all the attributes with the _l1 values and republish them on
         * zigbee2mqtt/mydevice/l1.
         */
        const entity = this.zigbee.resolveEntity(data.entity.name);
        if (entity.isDevice()) {
            for (const topic of Object.keys(this.getDiscovered(entity).messages)) {
                const objectID = topic.match(this.discoveryRegexWoTopic)?.[3];
                const lightMatch = /^light_(.*)/.exec(objectID);
                const coverMatch = /^cover_(.*)/.exec(objectID);
                const match = lightMatch || coverMatch;
                if (match) {
                    const endpoint = match[1];
                    const endpointRegExp = new RegExp(`(.*)_${endpoint}`);
                    const payload = {};
                    for (const key of Object.keys(data.message)) {
                        const keyMatch = endpointRegExp.exec(key);
                        if (keyMatch) {
                            payload[keyMatch[1]] = data.message[key];
                        }
                    }
                    await this.mqtt.publish(`${data.entity.name}/${endpoint}`, (0, json_stable_stringify_without_jsonify_1.default)(payload), {});
                }
            }
        }
        /**
         * Publish an empty value for click and action payload, in this way Home Assistant
         * can use Home Assistant entities in automations.
         * https://github.com/Koenkk/zigbee2mqtt/issues/959#issuecomment-480341347
         */
        if (settings.get().homeassistant.legacy_triggers) {
            const keys = ['action', 'click'].filter((k) => data.message[k]);
            for (const key of keys) {
                await this.publishEntityState(data.entity, { [key]: '' });
            }
        }
        /**
         * Implements the MQTT device trigger (https://www.home-assistant.io/integrations/device_trigger.mqtt/)
         * The MQTT device trigger does not support JSON parsing, so it cannot listen to zigbee2mqtt/my_device
         * Whenever a device publish an {action: *} we discover an MQTT device trigger sensor
         * and republish it to zigbee2mqtt/my_device/action
         */
        if (entity.isDevice() && entity.definition) {
            const keys = ['action', 'click'].filter((k) => data.message[k]);
            for (const key of keys) {
                const value = data.message[key].toString();
                await this.publishDeviceTriggerDiscover(entity, key, value);
                await this.mqtt.publish(`${data.entity.name}/${key}`, value, {});
            }
        }
    }
    async onEntityRenamed(data) {
        logger_1.default.debug(`Refreshing Home Assistant discovery topic for '${data.entity.name}'`);
        // Clear before rename so Home Assistant uses new friendly_name
        // https://github.com/Koenkk/zigbee2mqtt/issues/4096#issuecomment-674044916
        if (data.homeAssisantRename) {
            const discovered = this.getDiscovered(data.entity);
            for (const topic of Object.keys(discovered.messages)) {
                await this.mqtt.publish(topic, null, { retain: true, qos: 1 }, this.discoveryTopic, false, false);
            }
            discovered.messages = {};
            // Make sure Home Assistant deletes the old entity first otherwise another one (_2) is created
            // https://github.com/Koenkk/zigbee2mqtt/issues/12610
            await utils_1.default.sleep(2);
        }
        await this.discover(data.entity);
        if (data.entity.isDevice()) {
            for (const config of this.getDiscovered(data.entity).triggers) {
                const key = config.substring(0, config.indexOf('_'));
                const value = config.substring(config.indexOf('_') + 1);
                await this.publishDeviceTriggerDiscover(data.entity, key, value, true);
            }
        }
    }
    getConfigs(entity) {
        const isDevice = entity.isDevice();
        const isGroup = entity.isGroup();
        /* istanbul ignore next */
        if (!entity || (isDevice && !entity.definition))
            return [];
        let configs = [];
        if (isDevice) {
            const exposes = entity.exposes(); // avoid calling it hundred of times/s
            for (const expose of exposes) {
                configs.push(...this.exposeToConfig([expose], 'device', exposes, entity.definition));
            }
            for (const mapping of legacyMapping) {
                if (mapping.models.includes(entity.definition.model)) {
                    configs.push(mapping.discovery);
                }
            }
            // Deprecated in favour of exposes
            /* istanbul ignore if */
            if (entity.definition.hasOwnProperty('homeassistant')) {
                // @ts-ignore
                configs.push(entity.definition.homeassistant);
            }
        }
        else if (isGroup) {
            // group
            const exposesByType = {};
            const allExposes = [];
            entity.zh.members
                .map((e) => this.zigbee.resolveEntity(e.getDevice()))
                .filter((d) => d.definition)
                .forEach((device) => {
                const exposes = device.exposes();
                allExposes.push(...exposes);
                for (const expose of exposes.filter((e) => groupSupportedTypes.includes(e.type))) {
                    let key = expose.type;
                    if (['switch', 'lock', 'cover'].includes(expose.type) && expose.endpoint) {
                        // A device can have multiple of these types which have to discovered separately.
                        // e.g. switch with property state and valve_detection.
                        const state = expose.features.find((f) => f.name === 'state');
                        key += featurePropertyWithoutEndpoint(state);
                    }
                    if (!exposesByType[key])
                        exposesByType[key] = [];
                    exposesByType[key].push(expose);
                }
            });
            configs = [].concat(...Object.values(exposesByType).map((exposes) => this.exposeToConfig(exposes, 'group', allExposes)));
        }
        else {
            // Discover bridge config.
            configs.push(...entity.configs);
        }
        if (isDevice && settings.get().advanced.last_seen !== 'disable') {
            const config = {
                type: 'sensor',
                object_id: 'last_seen',
                mockProperties: [{ property: 'last_seen', value: null }],
                discovery_payload: {
                    name: 'Last seen',
                    value_template: '{{ value_json.last_seen }}',
                    icon: 'mdi:clock',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                },
            };
            /* istanbul ignore else */
            if (settings.get().advanced.last_seen.startsWith('ISO_8601')) {
                config.discovery_payload.device_class = 'timestamp';
            }
            configs.push(config);
        }
        if (isDevice && entity.definition.ota) {
            const updateStateSensor = {
                type: 'sensor',
                object_id: 'update_state',
                mockProperties: [], // update is mocked below with updateSensor
                discovery_payload: {
                    name: 'Update state',
                    icon: 'mdi:update',
                    value_template: `{{ value_json['update']['state'] }}`,
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                },
            };
            configs.push(updateStateSensor);
            const updateAvailableSensor = {
                type: 'binary_sensor',
                object_id: 'update_available',
                mockProperties: [{ property: 'update_available', value: null }],
                discovery_payload: {
                    name: null,
                    payload_on: true,
                    payload_off: false,
                    value_template: `{{ value_json['update']['state'] == "available" }}`,
                    enabled_by_default: false,
                    device_class: 'update',
                    entity_category: 'diagnostic',
                },
            };
            configs.push(updateAvailableSensor);
            const updateSensor = {
                type: 'update',
                object_id: 'update',
                mockProperties: [{ property: 'update', value: { state: null } }],
                discovery_payload: {
                    name: null,
                    entity_picture: 'https://github.com/Koenkk/zigbee2mqtt/raw/master/images/logo.png',
                    latest_version_topic: true,
                    state_topic: true,
                    device_class: 'firmware',
                    entity_category: 'config',
                    command_topic: `${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/update`,
                    payload_install: `{"id": "${entity.ieeeAddr}"}`,
                    value_template: `{{ value_json['update']['installed_version'] }}`,
                    latest_version_template: `{{ value_json['update']['latest_version'] }}`,
                    json_attributes_topic: `${settings.get().mqtt.base_topic}/${entity.name}`, // state topic
                    json_attributes_template: `{"in_progress": {{ iif(value_json['update']['state'] == 'updating', 'true', 'false') }} }`,
                },
            };
            configs.push(updateSensor);
        }
        // Discover scenes.
        const endpointsOrGroups = isDevice ? entity.zh.endpoints : isGroup ? [entity.zh] : [];
        endpointsOrGroups.forEach((endpointOrGroup) => {
            utils_1.default.getScenes(endpointOrGroup).forEach((scene) => {
                const sceneEntry = {
                    type: 'scene',
                    object_id: `scene_${scene.id}`,
                    mockProperties: [],
                    discovery_payload: {
                        name: `${scene.name}`,
                        state_topic: false,
                        command_topic: true,
                        payload_on: `{ "scene_recall": ${scene.id} }`,
                        object_id_postfix: `_${scene.name.replace(/\s+/g, '_').toLowerCase()}`,
                    },
                };
                configs.push(sceneEntry);
            });
        });
        if (isDevice && entity.options.hasOwnProperty('legacy') && !entity.options.legacy) {
            configs = configs.filter((c) => c !== sensorClick);
        }
        if (!settings.get().homeassistant.legacy_triggers) {
            configs = configs.filter((c) => c.object_id !== 'action' && c.object_id !== 'click');
        }
        // deep clone of the config objects
        configs = JSON.parse(JSON.stringify(configs));
        if (entity.options.homeassistant) {
            const s = entity.options.homeassistant;
            configs = configs.filter((config) => !s.hasOwnProperty(config.object_id) || s[config.object_id] != null);
            configs.forEach((config) => {
                const configOverride = s[config.object_id];
                if (configOverride) {
                    config.object_id = configOverride.object_id || config.object_id;
                    config.type = configOverride.type || config.type;
                }
            });
        }
        return configs;
    }
    async discover(entity, publish = true) {
        // Handle type differences.
        const isDevice = entity.isDevice();
        const isGroup = entity.isGroup();
        if (isGroup && entity.zh.members.length === 0) {
            return;
        }
        else if (isDevice &&
            (!entity.definition || entity.zh.interviewing || (entity.options.hasOwnProperty('homeassistant') && !entity.options.homeassistant))) {
            return;
        }
        const discovered = this.getDiscovered(entity);
        discovered.discovered = true;
        const lastDiscoveredTopics = Object.keys(discovered.messages);
        const newDiscoveredTopics = new Set();
        for (const config of this.getConfigs(entity)) {
            const payload = { ...config.discovery_payload };
            const baseTopic = `${settings.get().mqtt.base_topic}/${entity.name}`;
            let stateTopic = baseTopic;
            if (payload.state_topic_postfix) {
                stateTopic += `/${payload.state_topic_postfix}`;
                delete payload.state_topic_postfix;
            }
            if (!payload.hasOwnProperty('state_topic') || payload.state_topic) {
                payload.state_topic = stateTopic;
            }
            else {
                /* istanbul ignore else */
                if (payload.hasOwnProperty('state_topic')) {
                    delete payload.state_topic;
                }
            }
            if (payload.position_topic) {
                payload.position_topic = stateTopic;
            }
            if (payload.tilt_status_topic) {
                payload.tilt_status_topic = stateTopic;
            }
            if (this.entityAttributes && (isDevice || isGroup)) {
                payload.json_attributes_topic = stateTopic;
            }
            const devicePayload = this.getDevicePayload(entity);
            // Suggest object_id (entity_id) for entity
            payload.object_id = devicePayload.name.replace(/\s+/g, '_').toLowerCase();
            if (config.object_id.startsWith(config.type) && config.object_id.includes('_')) {
                payload.object_id += `_${config.object_id.split(/_(.+)/)[1]}`;
            }
            else if (!config.object_id.startsWith(config.type)) {
                payload.object_id += `_${config.object_id}`;
            }
            // Allow customization of the `payload.object_id` without touching the other uses of `config.object_id`
            // (e.g. for setting the `payload.unique_id` and as an internal key).
            payload.object_id = `${payload.object_id}${payload.object_id_postfix ?? ''}`;
            delete payload.object_id_postfix;
            // Set unique_id
            payload.unique_id = `${entity.options.ID}_${config.object_id}_${settings.get().mqtt.base_topic}`;
            // Attributes for device registry and origin
            payload.device = devicePayload;
            payload.origin = this.discoveryOrigin;
            // Availability payload (can be disabled by setting `payload.availability = false`).
            if (!payload.hasOwnProperty('availability') || payload.availability) {
                payload.availability = [{ topic: `${settings.get().mqtt.base_topic}/bridge/state` }];
                if (isDevice || isGroup) {
                    if (utils_1.default.isAvailabilityEnabledForEntity(entity, settings.get())) {
                        payload.availability_mode = 'all';
                        payload.availability.push({ topic: `${baseTopic}/availability` });
                    }
                }
                else {
                    // Bridge availability is different.
                    payload.availability_mode = 'all';
                }
                if (isDevice && entity.options.disabled) {
                    // Mark disabled device always as unavailable
                    payload.availability.forEach((a) => (a.value_template = '{{ "offline" }}'));
                }
                else if (!settings.get().advanced.legacy_availability_payload) {
                    payload.availability.forEach((a) => (a.value_template = '{{ value_json.state }}'));
                }
            }
            else {
                delete payload.availability;
            }
            const commandTopicPrefix = payload.command_topic_prefix ? `${payload.command_topic_prefix}/` : '';
            delete payload.command_topic_prefix;
            const commandTopicPostfix = payload.command_topic_postfix ? `/${payload.command_topic_postfix}` : '';
            delete payload.command_topic_postfix;
            const commandTopic = `${baseTopic}/${commandTopicPrefix}set${commandTopicPostfix}`;
            if (payload.command_topic && typeof payload.command_topic !== 'string') {
                payload.command_topic = commandTopic;
            }
            if (payload.set_position_topic) {
                payload.set_position_topic = commandTopic;
            }
            if (payload.tilt_command_topic) {
                payload.tilt_command_topic = `${baseTopic}/${commandTopicPrefix}set/tilt`;
            }
            if (payload.mode_state_topic) {
                payload.mode_state_topic = stateTopic;
            }
            if (payload.mode_command_topic) {
                payload.mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/system_mode`;
            }
            if (payload.current_temperature_topic) {
                payload.current_temperature_topic = stateTopic;
            }
            if (payload.temperature_state_topic) {
                payload.temperature_state_topic = stateTopic;
            }
            if (payload.temperature_low_state_topic) {
                payload.temperature_low_state_topic = stateTopic;
            }
            if (payload.temperature_high_state_topic) {
                payload.temperature_high_state_topic = stateTopic;
            }
            if (payload.temperature_command_topic) {
                payload.temperature_command_topic = `${baseTopic}/${commandTopicPrefix}set/${payload.temperature_command_topic}`;
            }
            if (payload.temperature_low_command_topic) {
                payload.temperature_low_command_topic = `${baseTopic}/${commandTopicPrefix}set/${payload.temperature_low_command_topic}`;
            }
            if (payload.temperature_high_command_topic) {
                payload.temperature_high_command_topic = `${baseTopic}/${commandTopicPrefix}set/${payload.temperature_high_command_topic}`;
            }
            if (payload.fan_mode_state_topic) {
                payload.fan_mode_state_topic = stateTopic;
            }
            if (payload.latest_version_topic) {
                payload.latest_version_topic = stateTopic;
            }
            if (payload.fan_mode_command_topic) {
                payload.fan_mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/fan_mode`;
            }
            if (payload.swing_mode_state_topic) {
                payload.swing_mode_state_topic = stateTopic;
            }
            if (payload.swing_mode_command_topic) {
                payload.swing_mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/swing_mode`;
            }
            if (payload.percentage_state_topic) {
                payload.percentage_state_topic = stateTopic;
            }
            if (payload.percentage_command_topic) {
                payload.percentage_command_topic = `${baseTopic}/${commandTopicPrefix}set/fan_mode`;
            }
            if (payload.preset_mode_state_topic) {
                payload.preset_mode_state_topic = stateTopic;
            }
            if (payload.preset_mode_command_topic) {
                payload.preset_mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/` + payload.preset_mode_command_topic;
            }
            if (payload.action_topic) {
                payload.action_topic = stateTopic;
            }
            // Override configuration with user settings.
            if (entity.options.homeassistant != undefined) {
                const add = (obj, ignoreName) => {
                    Object.keys(obj).forEach((key) => {
                        if (['type', 'object_id'].includes(key)) {
                            return;
                        }
                        else if (ignoreName && key === 'name') {
                            return;
                        }
                        else if (['number', 'string', 'boolean'].includes(typeof obj[key]) || Array.isArray(obj[key])) {
                            payload[key] = obj[key];
                        }
                        else if (obj[key] === null) {
                            delete payload[key];
                        }
                        else if (key === 'device' && typeof obj[key] === 'object') {
                            Object.keys(obj['device']).forEach((key) => {
                                payload['device'][key] = obj['device'][key];
                            });
                        }
                    });
                };
                add(entity.options.homeassistant, true);
                if (entity.options.homeassistant[config.object_id] != undefined) {
                    add(entity.options.homeassistant[config.object_id], false);
                }
            }
            if (entity.isDevice()) {
                entity.definition.meta?.overrideHaDiscoveryPayload?.(payload);
            }
            const topic = this.getDiscoveryTopic(config, entity);
            const payloadStr = (0, json_stable_stringify_without_jsonify_1.default)(payload);
            newDiscoveredTopics.add(topic);
            // Only discover when not discovered yet
            const discoveredMessage = discovered.messages[topic];
            if (!discoveredMessage || discoveredMessage.payload !== payloadStr || !discoveredMessage.published) {
                discovered.messages[topic] = { payload: payloadStr, published: publish };
                if (publish) {
                    await this.mqtt.publish(topic, payloadStr, { retain: true, qos: 1 }, this.discoveryTopic, false, false);
                }
            }
            else {
                logger_1.default.debug(`Skipping discovery of '${topic}', already discovered`);
            }
            config.mockProperties?.forEach((mockProperty) => discovered.mockProperties.add(mockProperty));
        }
        for (const topic of lastDiscoveredTopics) {
            const isDeviceAutomation = topic.match(this.discoveryRegexWoTopic)[1] === 'device_automation';
            if (!newDiscoveredTopics.has(topic) && !isDeviceAutomation) {
                await this.mqtt.publish(topic, null, { retain: true, qos: 1 }, this.discoveryTopic, false, false);
            }
        }
    }
    async onMQTTMessage(data) {
        const discoveryMatch = data.topic.match(this.discoveryRegex);
        const isDeviceAutomation = discoveryMatch && discoveryMatch[1] === 'device_automation';
        if (discoveryMatch) {
            // Clear outdated discovery configs and remember already discovered device_automations
            let message = null;
            try {
                message = JSON.parse(data.message);
                const baseTopic = settings.get().mqtt.base_topic + '/';
                if (isDeviceAutomation && (!message.topic || !message.topic.startsWith(baseTopic))) {
                    return;
                }
                if (!isDeviceAutomation && (!message.availability || !message.availability[0].topic.startsWith(baseTopic))) {
                    return;
                }
            }
            catch {
                return;
            }
            // Group discovery topic uses "ENCODEDBASETOPIC_GROUPID", device use ieeeAddr
            const ID = discoveryMatch[2].includes('_') ? discoveryMatch[2].split('_')[1] : discoveryMatch[2];
            const entity = ID === this.bridge.ID ? this.bridge : this.zigbee.resolveEntity(ID);
            let clear = !entity || (entity.isDevice() && !entity.definition);
            // Only save when topic matches otherwise config is not updated when renamed by editing configuration.yaml
            if (entity) {
                const key = `${discoveryMatch[3].substring(0, discoveryMatch[3].indexOf('_'))}`;
                const triggerTopic = `${settings.get().mqtt.base_topic}/${entity.name}/${key}`;
                if (isDeviceAutomation && message.topic === triggerTopic) {
                    this.getDiscovered(ID).triggers.add(discoveryMatch[3]);
                }
            }
            const topic = data.topic.substring(this.discoveryTopic.length + 1);
            if (!clear && !isDeviceAutomation && !(topic in this.getDiscovered(entity).messages)) {
                clear = true;
            }
            // Device was flagged to be excluded from homeassistant discovery
            clear = clear || (entity.options.hasOwnProperty('homeassistant') && !entity.options.homeassistant);
            if (clear) {
                logger_1.default.debug(`Clearing outdated Home Assistant config '${data.topic}'`);
                await this.mqtt.publish(topic, null, { retain: true, qos: 1 }, this.discoveryTopic, false, false);
            }
            else {
                this.getDiscovered(entity).messages[topic] = { payload: (0, json_stable_stringify_without_jsonify_1.default)(message), published: true };
            }
        }
        else if ((data.topic === this.statusTopic || data.topic === defaultStatusTopic) && data.message.toLowerCase() === 'online') {
            const timer = setTimeout(async () => {
                // Publish all device states.
                for (const entity of this.zigbee.devicesAndGroupsIterator(utils_1.default.deviceNotCoordinator)) {
                    if (this.state.exists(entity)) {
                        await this.publishEntityState(entity, this.state.get(entity), 'publishCached');
                    }
                }
                clearTimeout(timer);
            }, 30000);
        }
    }
    async onZigbeeEvent(data) {
        if (!this.getDiscovered(data.device).discovered) {
            await this.discover(data.device);
        }
    }
    async onScenesChanged(data) {
        // Re-trigger MQTT discovery of changed devices and groups, similar to bridge.ts
        // First, clear existing scene discovery topics
        logger_1.default.debug(`Clearing Home Assistant scene discovery for '${data.entity.name}'`);
        const discovered = this.getDiscovered(data.entity);
        for (const topic of Object.keys(discovered.messages)) {
            if (topic.startsWith('scene')) {
                await this.mqtt.publish(topic, null, { retain: true, qos: 1 }, this.discoveryTopic, false, false);
                delete discovered.messages[topic];
            }
        }
        // Make sure Home Assistant deletes the old entity first otherwise another one (_2) is created
        // https://github.com/Koenkk/zigbee2mqtt/issues/12610
        logger_1.default.debug(`Finished clearing scene discovery topics, waiting for Home Assistant.`);
        await utils_1.default.sleep(2);
        // Re-discover entity (including any new scenes).
        logger_1.default.debug(`Re-discovering entities with their scenes.`);
        await this.discover(data.entity);
    }
    getDevicePayload(entity) {
        const identifierPostfix = entity.isGroup() ? `zigbee2mqtt_${this.getEncodedBaseTopic()}` : 'zigbee2mqtt';
        // Allow device name to be overridden by homeassistant config
        let deviceName = entity.name;
        if (typeof entity.options.homeassistant?.name === 'string') {
            deviceName = entity.options.homeassistant.name;
        }
        const payload = {
            identifiers: [`${identifierPostfix}_${entity.options.ID}`],
            name: deviceName,
            sw_version: `Zigbee2MQTT ${this.zigbee2MQTTVersion}`,
        };
        const url = settings.get().frontend?.url ?? '';
        if (entity.isDevice()) {
            payload.model = `${entity.definition.description} (${entity.definition.model})`;
            payload.manufacturer = entity.definition.vendor;
            payload.sw_version = entity.zh.softwareBuildID;
            payload.configuration_url = `${url}/#/device/${entity.ieeeAddr}/info`;
        }
        else if (entity.isGroup()) {
            payload.model = 'Group';
            payload.manufacturer = 'Zigbee2MQTT';
            payload.configuration_url = `${url}/#/group/${entity.ID}`;
        }
        else {
            payload.model = 'Bridge';
            payload.manufacturer = 'Zigbee2MQTT';
            payload.hw_version = `${entity.hardwareVersion} ${entity.firmwareVersion}`;
            payload.sw_version = this.zigbee2MQTTVersion;
            payload.configuration_url = `${url}/#/settings`;
        }
        if (!url) {
            delete payload.configuration_url;
        }
        // Link devices & groups to bridge.
        if (entity !== this.bridge) {
            payload.via_device = this.bridgeIdentifier;
        }
        return payload;
    }
    adjustMessageBeforePublish(entity, message) {
        this.getDiscovered(entity).mockProperties.forEach((mockProperty) => {
            if (!message.hasOwnProperty(mockProperty.property)) {
                message[mockProperty.property] = mockProperty.value;
            }
        });
        // Copy hue -> h, saturation -> s to make homeassistant happy
        if (message.hasOwnProperty('color')) {
            if (message.color.hasOwnProperty('hue')) {
                message.color.h = message.color.hue;
            }
            if (message.color.hasOwnProperty('saturation')) {
                message.color.s = message.color.saturation;
            }
        }
        if (entity.isDevice() && entity.definition?.ota && message.update?.latest_version == null) {
            message.update = { ...message.update, installed_version: -1, latest_version: -1 };
        }
    }
    getEncodedBaseTopic() {
        return settings
            .get()
            .mqtt.base_topic.split('')
            .map((s) => s.charCodeAt(0).toString())
            .join('');
    }
    getDiscoveryTopic(config, entity) {
        const key = entity.isDevice() ? entity.ieeeAddr : `${this.getEncodedBaseTopic()}_${entity.ID}`;
        return `${config.type}/${key}/${config.object_id}/config`;
    }
    async publishDeviceTriggerDiscover(device, key, value, force = false) {
        const haConfig = device.options.homeassistant;
        if (device.options.hasOwnProperty('homeassistant') &&
            (haConfig == null || (haConfig.hasOwnProperty('device_automation') && typeof haConfig === 'object' && haConfig.device_automation == null))) {
            return;
        }
        const discovered = this.getDiscovered(device);
        const discoveredKey = `${key}_${value}`;
        if (discovered.triggers.has(discoveredKey) && !force) {
            return;
        }
        const config = {
            type: 'device_automation',
            object_id: `${key}_${value}`,
            mockProperties: [],
            discovery_payload: {
                automation_type: 'trigger',
                type: key,
            },
        };
        const topic = this.getDiscoveryTopic(config, device);
        const payload = {
            ...config.discovery_payload,
            subtype: value,
            payload: value,
            topic: `${settings.get().mqtt.base_topic}/${device.name}/${key}`,
            device: this.getDevicePayload(device),
            origin: this.discoveryOrigin,
        };
        await this.mqtt.publish(topic, (0, json_stable_stringify_without_jsonify_1.default)(payload), { retain: true, qos: 1 }, this.discoveryTopic, false, false);
        discovered.triggers.add(discoveredKey);
    }
    getBridgeEntity(coordinatorVersion) {
        const coordinatorIeeeAddress = this.zigbee.firstCoordinatorEndpoint().deviceIeeeAddress;
        const discovery = [];
        const bridge = new Bridge(coordinatorIeeeAddress, coordinatorVersion, discovery);
        const baseTopic = `${settings.get().mqtt.base_topic}/${bridge.name}`;
        const legacyAvailability = settings.get().advanced.legacy_availability_payload;
        discovery.push(
        // Binary sensors.
        {
            type: 'binary_sensor',
            object_id: 'connection_state',
            mockProperties: [],
            discovery_payload: {
                name: 'Connection state',
                device_class: 'connectivity',
                entity_category: 'diagnostic',
                state_topic: true,
                state_topic_postfix: 'state',
                value_template: !legacyAvailability ? '{{ value_json.state }}' : '{{ value }}',
                payload_on: 'online',
                payload_off: 'offline',
                availability: false,
            },
        }, {
            type: 'binary_sensor',
            object_id: 'restart_required',
            mockProperties: [],
            discovery_payload: {
                name: 'Restart required',
                device_class: 'problem',
                entity_category: 'diagnostic',
                enabled_by_default: false,
                state_topic: true,
                state_topic_postfix: 'info',
                value_template: '{{ value_json.restart_required }}',
                payload_on: true,
                payload_off: false,
            },
        }, 
        // Buttons.
        {
            type: 'button',
            object_id: 'restart',
            mockProperties: [],
            discovery_payload: {
                name: 'Restart',
                device_class: 'restart',
                state_topic: false,
                command_topic: `${baseTopic}/request/restart`,
                payload_press: '',
            },
        }, 
        // Selects.
        {
            type: 'select',
            object_id: 'log_level',
            mockProperties: [],
            discovery_payload: {
                name: 'Log level',
                entity_category: 'config',
                state_topic: true,
                state_topic_postfix: 'info',
                value_template: '{{ value_json.log_level | lower }}',
                command_topic: `${baseTopic}/request/options`,
                command_template: '{"options": {"advanced": {"log_level": "{{ value }}" } } }',
                options: settings.LOG_LEVELS,
            },
        }, 
        // Sensors:
        {
            type: 'sensor',
            object_id: 'version',
            mockProperties: [],
            discovery_payload: {
                name: 'Version',
                icon: 'mdi:zigbee',
                entity_category: 'diagnostic',
                state_topic: true,
                state_topic_postfix: 'info',
                value_template: '{{ value_json.version }}',
            },
        }, {
            type: 'sensor',
            object_id: 'coordinator_version',
            mockProperties: [],
            discovery_payload: {
                name: 'Coordinator version',
                icon: 'mdi:chip',
                entity_category: 'diagnostic',
                enabled_by_default: false,
                state_topic: true,
                state_topic_postfix: 'info',
                value_template: '{{ value_json.coordinator.meta.revision }}',
            },
        }, {
            type: 'sensor',
            object_id: 'network_map',
            mockProperties: [],
            discovery_payload: {
                name: 'Network map',
                entity_category: 'diagnostic',
                enabled_by_default: false,
                state_topic: true,
                state_topic_postfix: 'response/networkmap',
                value_template: "{{ now().strftime('%Y-%m-%d %H:%M:%S') }}",
                json_attributes_topic: `${baseTopic}/response/networkmap`,
                json_attributes_template: '{{ value_json.data.value | tojson }}',
            },
        }, {
            type: 'sensor',
            object_id: 'permit_join_timeout',
            mockProperties: [],
            discovery_payload: {
                name: 'Permit join timeout',
                device_class: 'duration',
                unit_of_measurement: 's',
                entity_category: 'diagnostic',
                state_topic: true,
                state_topic_postfix: 'info',
                value_template: '{{ iif(value_json.permit_join_timeout is defined, value_json.permit_join_timeout, None) }}',
            },
        }, 
        // Switches.
        {
            type: 'switch',
            object_id: 'permit_join',
            mockProperties: [],
            discovery_payload: {
                name: 'Permit join',
                icon: 'mdi:human-greeting-proximity',
                state_topic: true,
                state_topic_postfix: 'info',
                value_template: '{{ value_json.permit_join | lower }}',
                command_topic: `${baseTopic}/request/permit_join`,
                payload_on: 'true',
                payload_off: 'false',
            },
        });
        return bridge;
    }
}
exports.default = HomeAssistant;
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onEntityRemoved", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onGroupMembersChanged", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onPublishEntityState", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onEntityRenamed", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onZigbeeEvent", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onScenesChanged", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9tZWFzc2lzdGFudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vaG9tZWFzc2lzdGFudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsb0RBQTRCO0FBQzVCLG9FQUFrQztBQUNsQyxrSEFBOEQ7QUFHOUQsNERBQW9DO0FBQ3BDLDJEQUE2QztBQUM3Qyx1REFBd0c7QUFDeEcsNERBQW9DO0FBZXBDLE1BQU0sV0FBVyxHQUFtQjtJQUNoQyxJQUFJLEVBQUUsUUFBUTtJQUNkLFNBQVMsRUFBRSxPQUFPO0lBQ2xCLGNBQWMsRUFBRSxDQUFDLEVBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFDLENBQUM7SUFDbEQsaUJBQWlCLEVBQUU7UUFDZixJQUFJLEVBQUUsT0FBTztRQUNiLElBQUksRUFBRSxtQkFBbUI7UUFDekIsY0FBYyxFQUFFLHdCQUF3QjtLQUMzQztDQUNKLENBQUM7QUFTRixNQUFNLFlBQVksR0FBRyxLQUFLLENBQUM7QUFDM0IsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQ3pCLE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztBQUNqRSxNQUFNLGtCQUFrQixHQUFHLHNCQUFzQixDQUFDO0FBRWxELE1BQU0sYUFBYSxHQUFHO0lBQ2xCO1FBQ0ksTUFBTSxFQUFFO1lBQ0osVUFBVTtZQUNWLGVBQWU7WUFDZixhQUFhO1lBQ2IsYUFBYTtZQUNiLGFBQWE7WUFDYixhQUFhO1lBQ2IsT0FBTztZQUNQLGNBQWM7WUFDZCxhQUFhO1lBQ2IsWUFBWTtZQUNaLGNBQWM7WUFDZCxVQUFVO1lBQ1YsVUFBVTtZQUNWLFNBQVM7WUFDVCxXQUFXO1lBQ1gsY0FBYztZQUNkLFVBQVU7WUFDVixVQUFVO1lBQ1YsZUFBZTtZQUNmLGVBQWU7WUFD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