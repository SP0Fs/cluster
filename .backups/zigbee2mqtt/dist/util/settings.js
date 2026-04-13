"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testing = exports.LOG_LEVELS = exports.schema = void 0;
exports.validate = validate;
exports.get = get;
exports.set = set;
exports.apply = apply;
exports.getGroup = getGroup;
exports.getGroups = getGroups;
exports.getDevice = getDevice;
exports.addDevice = addDevice;
exports.addDeviceToPasslist = addDeviceToPasslist;
exports.blockDevice = blockDevice;
exports.removeDevice = removeDevice;
exports.addGroup = addGroup;
exports.addDeviceToGroup = addDeviceToGroup;
exports.removeDeviceFromGroup = removeDeviceFromGroup;
exports.removeGroup = removeGroup;
exports.changeEntityOptions = changeEntityOptions;
exports.changeFriendlyName = changeFriendlyName;
exports.reRead = reRead;
const ajv_1 = __importDefault(require("ajv"));
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
const path_1 = __importDefault(require("path"));
const data_1 = __importDefault(require("./data"));
const settings_schema_json_1 = __importDefault(require("./settings.schema.json"));
const utils_1 = __importDefault(require("./utils"));
const yaml_1 = __importDefault(require("./yaml"));
exports.schema = settings_schema_json_1.default;
// @ts-expect-error
exports.schema = {};
(0, object_assign_deep_1.default)(exports.schema, settings_schema_json_1.default);
// Remove legacy settings from schema
{
    delete exports.schema.properties.advanced.properties.homeassistant_discovery_topic;
    delete exports.schema.properties.advanced.properties.homeassistant_legacy_entity_attributes;
    delete exports.schema.properties.advanced.properties.homeassistant_legacy_triggers;
    delete exports.schema.properties.advanced.properties.homeassistant_status_topic;
    delete exports.schema.properties.advanced.properties.soft_reset_timeout;
    delete exports.schema.properties.advanced.properties.report;
    delete exports.schema.properties.advanced.properties.baudrate;
    delete exports.schema.properties.advanced.properties.rtscts;
    delete exports.schema.properties.advanced.properties.ikea_ota_use_test_url;
    delete exports.schema.properties.experimental;
    delete settings_schema_json_1.default.properties.whitelist;
    delete settings_schema_json_1.default.properties.ban;
}
/** NOTE: by order of priority, lower index is lower level (more important) */
exports.LOG_LEVELS = ['error', 'warning', 'info', 'debug'];
// DEPRECATED ZIGBEE2MQTT_CONFIG: https://github.com/Koenkk/zigbee2mqtt/issues/4697
const file = process.env.ZIGBEE2MQTT_CONFIG ?? data_1.default.joinPath('configuration.yaml');
const NULLABLE_SETTINGS = ['homeassistant'];
const ajvSetting = new ajv_1.default({ allErrors: true }).addKeyword('requiresRestart').compile(settings_schema_json_1.default);
const ajvRestartRequired = new ajv_1.default({ allErrors: true }).addKeyword({ keyword: 'requiresRestart', validate: (s) => !s }).compile(settings_schema_json_1.default);
const ajvRestartRequiredDeviceOptions = new ajv_1.default({ allErrors: true })
    .addKeyword({ keyword: 'requiresRestart', validate: (s) => !s })
    .compile(settings_schema_json_1.default.definitions.device);
const ajvRestartRequiredGroupOptions = new ajv_1.default({ allErrors: true })
    .addKeyword({ keyword: 'requiresRestart', validate: (s) => !s })
    .compile(settings_schema_json_1.default.definitions.group);
const defaults = {
    permit_join: false,
    external_converters: [],
    mqtt: {
        base_topic: 'zigbee2mqtt',
        include_device_information: false,
        force_disable_retain: false,
    },
    serial: {
        disable_led: false,
    },
    passlist: [],
    blocklist: [],
    map_options: {
        graphviz: {
            colors: {
                fill: {
                    enddevice: '#fff8ce',
                    coordinator: '#e04e5d',
                    router: '#4ea3e0',
                },
                font: {
                    coordinator: '#ffffff',
                    router: '#ffffff',
                    enddevice: '#000000',
                },
                line: {
                    active: '#009900',
                    inactive: '#994444',
                },
            },
        },
    },
    ota: {
        update_check_interval: 24 * 60,
        disable_automatic_update_check: false,
    },
    device_options: {},
    advanced: {
        legacy_api: true,
        legacy_availability_payload: true,
        log_rotation: true,
        log_symlink_current: false,
        log_output: ['console', 'file'],
        log_directory: path_1.default.join(data_1.default.getPath(), 'log', '%TIMESTAMP%'),
        log_file: 'log.log',
        log_level: /* istanbul ignore next */ process.env.DEBUG ? 'debug' : 'info',
        log_namespaced_levels: {},
        log_syslog: {},
        log_debug_to_mqtt_frontend: false,
        log_debug_namespace_ignore: '',
        pan_id: 0x1a62,
        ext_pan_id: [0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd],
        channel: 11,
        adapter_concurrent: null,
        adapter_delay: null,
        cache_state: true,
        cache_state_persistent: true,
        cache_state_send_on_startup: true,
        last_seen: 'disable',
        elapsed: false,
        network_key: [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 13],
        timestamp_format: 'YYYY-MM-DD HH:mm:ss',
        output: 'json',
        // Everything below is deprecated
        availability_blocklist: [],
        availability_passlist: [],
        availability_blacklist: [],
        availability_whitelist: [],
        soft_reset_timeout: 0,
        report: false,
    },
};
let _settings;
let _settingsWithDefaults;
function loadSettingsWithDefaults() {
    _settingsWithDefaults = (0, object_assign_deep_1.default)({}, defaults, getInternalSettings());
    if (!_settingsWithDefaults.devices) {
        _settingsWithDefaults.devices = {};
    }
    if (!_settingsWithDefaults.groups) {
        _settingsWithDefaults.groups = {};
    }
    if (_settingsWithDefaults.homeassistant) {
        const defaults = { discovery_topic: 'homeassistant', status_topic: 'hass/status', legacy_entity_attributes: true, legacy_triggers: true };
        const sLegacy = {};
        if (_settingsWithDefaults.advanced) {
            for (const key of [
                'homeassistant_legacy_triggers',
                'homeassistant_discovery_topic',
                'homeassistant_legacy_entity_attributes',
                'homeassistant_status_topic',
            ]) {
                // @ts-expect-error
                if (_settingsWithDefaults.advanced[key] !== undefined) {
                    // @ts-expect-error
                    sLegacy[key.replace('homeassistant_', '')] = _settingsWithDefaults.advanced[key];
                }
            }
        }
        const s = typeof _settingsWithDefaults.homeassistant === 'object' ? _settingsWithDefaults.homeassistant : {};
        // @ts-expect-error
        _settingsWithDefaults.homeassistant = {};
        (0, object_assign_deep_1.default)(_settingsWithDefaults.homeassistant, defaults, sLegacy, s);
    }
    if (_settingsWithDefaults.availability || _settingsWithDefaults.advanced?.availability_timeout) {
        const defaults = {};
        const s = typeof _settingsWithDefaults.availability === 'object' ? _settingsWithDefaults.availability : {};
        // @ts-expect-error
        _settingsWithDefaults.availability = {};
        (0, object_assign_deep_1.default)(_settingsWithDefaults.availability, defaults, s);
    }
    if (_settingsWithDefaults.frontend) {
        const defaults = { port: 8080, auth_token: false };
        const s = typeof _settingsWithDefaults.frontend === 'object' ? _settingsWithDefaults.frontend : {};
        _settingsWithDefaults.frontend = {};
        (0, object_assign_deep_1.default)(_settingsWithDefaults.frontend, defaults, s);
    }
    if (_settings.advanced?.hasOwnProperty('baudrate') && _settings.serial?.baudrate == null) {
        // @ts-expect-error
        _settingsWithDefaults.serial.baudrate = _settings.advanced.baudrate;
    }
    if (_settings.advanced?.hasOwnProperty('rtscts') && _settings.serial?.rtscts == null) {
        // @ts-expect-error
        _settingsWithDefaults.serial.rtscts = _settings.advanced.rtscts;
    }
    if (_settings.advanced?.hasOwnProperty('ikea_ota_use_test_url') && _settings.ota?.ikea_ota_use_test_url == null) {
        // @ts-expect-error
        _settingsWithDefaults.ota.ikea_ota_use_test_url = _settings.advanced.ikea_ota_use_test_url;
    }
    // @ts-expect-error
    if (_settings.experimental?.hasOwnProperty('transmit_power') && _settings.advanced?.transmit_power == null) {
        // @ts-expect-error
        _settingsWithDefaults.advanced.transmit_power = _settings.experimental.transmit_power;
    }
    // @ts-expect-error
    if (_settings.experimental?.hasOwnProperty('output') && _settings.advanced?.output == null) {
        // @ts-expect-error
        _settingsWithDefaults.advanced.output = _settings.experimental.output;
    }
    if (_settings.advanced?.log_level === 'warn') {
        _settingsWithDefaults.advanced.log_level = 'warning';
    }
    // @ts-expect-error
    if (_settingsWithDefaults.ban) {
        // @ts-expect-error
        _settingsWithDefaults.blocklist.push(..._settingsWithDefaults.ban);
    }
    // @ts-expect-error
    if (_settingsWithDefaults.whitelist) {
        // @ts-expect-error
        _settingsWithDefaults.passlist.push(..._settingsWithDefaults.whitelist);
    }
}
function parseValueRef(text) {
    const match = /!(.*) (.*)/g.exec(text);
    if (match) {
        let filename = match[1];
        // This is mainly for backward compatibility.
        if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) {
            filename += '.yaml';
        }
        return { filename, key: match[2] };
    }
    else {
        return null;
    }
}
function write() {
    const settings = getInternalSettings();
    const toWrite = (0, object_assign_deep_1.default)({}, settings);
    // Read settings to check if we have to split devices/groups into separate file.
    const actual = yaml_1.default.read(file);
    // In case the setting is defined in a separate file (e.g. !secret network_key) update it there.
    for (const path of [
        ['mqtt', 'server'],
        ['mqtt', 'user'],
        ['mqtt', 'password'],
        ['advanced', 'network_key'],
        ['frontend', 'auth_token'],
    ]) {
        if (actual[path[0]] && actual[path[0]][path[1]]) {
            const ref = parseValueRef(actual[path[0]][path[1]]);
            if (ref) {
                yaml_1.default.updateIfChanged(data_1.default.joinPath(ref.filename), ref.key, toWrite[path[0]][path[1]]);
                toWrite[path[0]][path[1]] = actual[path[0]][path[1]];
            }
        }
    }
    // Write devices/groups to separate file if required.
    const writeDevicesOrGroups = (type) => {
        if (typeof actual[type] === 'string' || (Array.isArray(actual[type]) && actual[type].length > 0)) {
            const fileToWrite = Array.isArray(actual[type]) ? actual[type][0] : actual[type];
            const content = (0, object_assign_deep_1.default)({}, settings[type]);
            // If an array, only write to first file and only devices which are not in the other files.
            if (Array.isArray(actual[type])) {
                actual[type]
                    .filter((f, i) => i !== 0)
                    .map((f) => yaml_1.default.readIfExists(data_1.default.joinPath(f), {}))
                    .map((c) => Object.keys(c))
                    // @ts-expect-error
                    .forEach((k) => delete content[k]);
            }
            yaml_1.default.writeIfChanged(data_1.default.joinPath(fileToWrite), content);
            toWrite[type] = actual[type];
        }
    };
    writeDevicesOrGroups('devices');
    writeDevicesOrGroups('groups');
    yaml_1.default.writeIfChanged(file, toWrite);
    _settings = read();
    loadSettingsWithDefaults();
}
function validate() {
    try {
        getInternalSettings();
    }
    catch (error) {
        if (error.name === 'YAMLException') {
            return [`Your YAML file: '${error.file}' is invalid (use https://jsonformatter.org/yaml-validator to find and fix the issue)`];
        }
        return [error.message];
    }
    if (!ajvSetting(_settings)) {
        return ajvSetting.errors.map((v) => `${v.instancePath.substring(1)} ${v.message}`);
    }
    const errors = [];
    if (_settings.advanced &&
        _settings.advanced.network_key &&
        typeof _settings.advanced.network_key === 'string' &&
        _settings.advanced.network_key !== 'GENERATE') {
        errors.push(`advanced.network_key: should be array or 'GENERATE' (is '${_settings.advanced.network_key}')`);
    }
    if (_settings.advanced &&
        _settings.advanced.pan_id &&
        typeof _settings.advanced.pan_id === 'string' &&
        _settings.advanced.pan_id !== 'GENERATE') {
        errors.push(`advanced.pan_id: should be number or 'GENERATE' (is '${_settings.advanced.pan_id}')`);
    }
    if (_settings.advanced &&
        _settings.advanced.ext_pan_id &&
        typeof _settings.advanced.ext_pan_id === 'string' &&
        _settings.advanced.ext_pan_id !== 'GENERATE') {
        errors.push(`advanced.ext_pan_id: should be array or 'GENERATE' (is '${_settings.advanced.ext_pan_id}')`);
    }
    // Verify that all friendly names are unique
    const names = [];
    const check = (e) => {
        if (names.includes(e.friendly_name))
            errors.push(`Duplicate friendly_name '${e.friendly_name}' found`);
        errors.push(...utils_1.default.validateFriendlyName(e.friendly_name));
        names.push(e.friendly_name);
        if (e.qos != null && ![0, 1, 2].includes(e.qos)) {
            errors.push(`QOS for '${e.friendly_name}' not valid, should be 0, 1 or 2 got ${e.qos}`);
        }
    };
    const settingsWithDefaults = get();
    Object.values(settingsWithDefaults.devices).forEach((d) => check(d));
    Object.values(settingsWithDefaults.groups).forEach((g) => check(g));
    if (settingsWithDefaults.mqtt.version !== 5) {
        for (const device of Object.values(settingsWithDefaults.devices)) {
            if (device.retention) {
                errors.push('MQTT retention requires protocol version 5');
            }
        }
    }
    const checkAvailabilityList = (list, type) => {
        list.forEach((e) => {
            if (!getDevice(e)) {
                errors.push(`Non-existing entity '${e}' specified in '${type}'`);
            }
        });
    };
    checkAvailabilityList(settingsWithDefaults.advanced.availability_blacklist, 'availability_blacklist');
    checkAvailabilityList(settingsWithDefaults.advanced.availability_whitelist, 'availability_whitelist');
    checkAvailabilityList(settingsWithDefaults.advanced.availability_blocklist, 'availability_blocklist');
    checkAvailabilityList(settingsWithDefaults.advanced.availability_passlist, 'availability_passlist');
    return errors;
}
function read() {
    const s = yaml_1.default.read(file);
    applyEnvironmentVariables(s);
    // Read !secret MQTT username and password if set
    // eslint-disable-next-line
    const interpretValue = (value) => {
        const ref = parseValueRef(value);
        if (ref) {
            return yaml_1.default.read(data_1.default.joinPath(ref.filename))[ref.key];
        }
        else {
            return value;
        }
    };
    if (s.mqtt?.user) {
        s.mqtt.user = interpretValue(s.mqtt.user);
    }
    if (s.mqtt?.password) {
        s.mqtt.password = interpretValue(s.mqtt.password);
    }
    if (s.mqtt?.server) {
        s.mqtt.server = interpretValue(s.mqtt.server);
    }
    if (s.advanced?.network_key) {
        s.advanced.network_key = interpretValue(s.advanced.network_key);
    }
    if (s.frontend?.auth_token) {
        s.frontend.auth_token = interpretValue(s.frontend.auth_token);
    }
    // Read devices/groups configuration from separate file if specified.
    const readDevicesOrGroups = (type) => {
        if (typeof s[type] === 'string' || (Array.isArray(s[type]) && Array(s[type]).length > 0)) {
            /* eslint-disable-line */
            const files = Array.isArray(s[type]) ? s[type] : [s[type]];
            s[type] = {};
            for (const file of files) {
                const content = yaml_1.default.readIfExists(data_1.default.joinPath(file), {});
                /* eslint-disable-line */ // @ts-expect-error
                s[type] = object_assign_deep_1.default.noMutate(s[type], content);
            }
        }
    };
    readDevicesOrGroups('devices');
    readDevicesOrGroups('groups');
    return s;
}
function applyEnvironmentVariables(settings) {
    const iterate = (obj, path) => {
        Object.keys(obj).forEach((key) => {
            if (key !== 'type') {
                if (key !== 'properties' && obj[key]) {
                    const type = (obj[key].type || 'object').toString();
                    const envPart = path.reduce((acc, val) => `${acc}${val}_`, '');
                    const envVariableName = `ZIGBEE2MQTT_CONFIG_${envPart}${key}`.toUpperCase();
                    if (process.env[envVariableName]) {
                        const setting = path.reduce((acc, val) => {
                            /* eslint-disable-line */ // @ts-expect-error
                            acc[val] = acc[val] || {};
                            /* eslint-disable-line */ // @ts-expect-error
                            return acc[val];
                        }, settings);
                        if (type.indexOf('object') >= 0 || type.indexOf('array') >= 0) {
                            try {
                                setting[key] = JSON.parse(process.env[envVariableName]);
                            }
                            catch {
                                setting[key] = process.env[envVariableName];
                            }
                        }
                        else if (type.indexOf('number') >= 0) {
                            /* eslint-disable-line */ // @ts-expect-error
                            setting[key] = process.env[envVariableName] * 1;
                        }
                        else if (type.indexOf('boolean') >= 0) {
                            setting[key] = process.env[envVariableName].toLowerCase() === 'true';
                        }
                        else {
                            /* istanbul ignore else */
                            if (type.indexOf('string') >= 0) {
                                setting[key] = process.env[envVariableName];
                            }
                        }
                    }
                }
                if (typeof obj[key] === 'object' && obj[key]) {
                    const newPath = [...path];
                    if (key !== 'properties' && key !== 'oneOf' && !Number.isInteger(Number(key))) {
                        newPath.push(key);
                    }
                    iterate(obj[key], newPath);
                }
            }
        });
    };
    iterate(settings_schema_json_1.default.properties, []);
}
function getInternalSettings() {
    if (!_settings) {
        _settings = read();
    }
    return _settings;
}
function get() {
    if (!_settingsWithDefaults) {
        loadSettingsWithDefaults();
    }
    return _settingsWithDefaults;
}
function set(path, value) {
    /* eslint-disable-next-line */
    let settings = getInternalSettings();
    for (let i = 0; i < path.length; i++) {
        const key = path[i];
        if (i === path.length - 1) {
            settings[key] = value;
        }
        else {
            if (!settings[key]) {
                settings[key] = {};
            }
            settings = settings[key];
        }
    }
    write();
}
function apply(settings) {
    getInternalSettings(); // Ensure _settings is initialized.
    /* eslint-disable-line */ // @ts-expect-error
    const newSettings = object_assign_deep_1.default.noMutate(_settings, settings);
    utils_1.default.removeNullPropertiesFromObject(newSettings, NULLABLE_SETTINGS);
    ajvSetting(newSettings);
    const errors = ajvSetting.errors && ajvSetting.errors.filter((e) => e.keyword !== 'required');
    if (errors?.length) {
        const error = errors[0];
        throw new Error(`${error.instancePath.substring(1)} ${error.message}`);
    }
    _settings = newSettings;
    write();
    ajvRestartRequired(settings);
    const restartRequired = ajvRestartRequired.errors && !!ajvRestartRequired.errors.find((e) => e.keyword === 'requiresRestart');
    return restartRequired;
}
function getGroup(IDorName) {
    const settings = get();
    const byID = settings.groups[IDorName];
    if (byID) {
        return { devices: [], ...byID, ID: Number(IDorName) };
    }
    for (const [ID, group] of Object.entries(settings.groups)) {
        if (group.friendly_name === IDorName) {
            return { devices: [], ...group, ID: Number(ID) };
        }
    }
    return null;
}
function getGroups() {
    const settings = get();
    return Object.entries(settings.groups).map(([ID, group]) => {
        return { devices: [], ...group, ID: Number(ID) };
    });
}
function getGroupThrowIfNotExists(IDorName) {
    const group = getGroup(IDorName);
    if (!group) {
        throw new Error(`Group '${IDorName}' does not exist`);
    }
    return group;
}
function getDevice(IDorName) {
    const settings = get();
    const byID = settings.devices[IDorName];
    if (byID) {
        return { ...byID, ID: IDorName };
    }
    for (const [ID, device] of Object.entries(settings.devices)) {
        if (device.friendly_name === IDorName) {
            return { ...device, ID };
        }
    }
    return null;
}
function getDeviceThrowIfNotExists(IDorName) {
    const device = getDevice(IDorName);
    if (!device) {
        throw new Error(`Device '${IDorName}' does not exist`);
    }
    return device;
}
function addDevice(ID) {
    if (getDevice(ID)) {
        throw new Error(`Device '${ID}' already exists`);
    }
    const settings = getInternalSettings();
    if (!settings.devices) {
        settings.devices = {};
    }
    settings.devices[ID] = { friendly_name: ID };
    write();
    return getDevice(ID);
}
function addDeviceToPasslist(ID) {
    const settings = getInternalSettings();
    if (!settings.passlist) {
        settings.passlist = [];
    }
    if (settings.passlist.includes(ID)) {
        throw new Error(`Device '${ID}' already in passlist`);
    }
    settings.passlist.push(ID);
    write();
}
function blockDevice(ID) {
    const settings = getInternalSettings();
    if (!settings.blocklist) {
        settings.blocklist = [];
    }
    settings.blocklist.push(ID);
    write();
}
function removeDevice(IDorName) {
    const device = getDeviceThrowIfNotExists(IDorName);
    const settings = getInternalSettings();
    delete settings.devices[device.ID];
    // Remove device from groups
    if (settings.groups) {
        const regex = new RegExp(`^(${device.friendly_name}|${device.ID})(/[^/]+)?$`);
        for (const group of Object.values(settings.groups).filter((g) => g.devices)) {
            group.devices = group.devices.filter((device) => !device.match(regex));
        }
    }
    write();
}
function addGroup(name, ID) {
    utils_1.default.validateFriendlyName(name, true);
    if (getGroup(name) || getDevice(name)) {
        throw new Error(`friendly_name '${name}' is already in use`);
    }
    const settings = getInternalSettings();
    if (!settings.groups) {
        settings.groups = {};
    }
    if (ID == null) {
        // look for free ID
        ID = '1';
        while (settings.groups.hasOwnProperty(ID)) {
            ID = (Number.parseInt(ID) + 1).toString();
        }
    }
    else {
        // ensure provided ID is not in use
        ID = ID.toString();
        if (settings.groups.hasOwnProperty(ID)) {
            throw new Error(`Group ID '${ID}' is already in use`);
        }
    }
    settings.groups[ID] = { friendly_name: name };
    write();
    return getGroup(ID);
}
function groupGetDevice(group, keys) {
    for (const device of group.devices ?? []) {
        if (keys.includes(device))
            return device;
    }
    return null;
}
function addDeviceToGroup(IDorName, keys) {
    const groupID = getGroupThrowIfNotExists(IDorName).ID;
    const settings = getInternalSettings();
    const group = settings.groups[groupID];
    if (!groupGetDevice(group, keys)) {
        if (!group.devices)
            group.devices = [];
        group.devices.push(keys[0]);
        write();
    }
}
function removeDeviceFromGroup(IDorName, keys) {
    const groupID = getGroupThrowIfNotExists(IDorName).ID;
    const settings = getInternalSettings();
    const group = settings.groups[groupID];
    if (!group.devices) {
        return;
    }
    const key = groupGetDevice(group, keys);
    if (key) {
        group.devices = group.devices.filter((d) => d != key);
        write();
    }
}
function removeGroup(IDorName) {
    const groupID = getGroupThrowIfNotExists(IDorName.toString()).ID;
    const settings = getInternalSettings();
    delete settings.groups[groupID];
    write();
}
function changeEntityOptions(IDorName, newOptions) {
    const settings = getInternalSettings();
    delete newOptions.friendly_name;
    delete newOptions.devices;
    let validator;
    if (getDevice(IDorName)) {
        (0, object_assign_deep_1.default)(settings.devices[getDevice(IDorName).ID], newOptions);
        utils_1.default.removeNullPropertiesFromObject(settings.devices[getDevice(IDorName).ID], NULLABLE_SETTINGS);
        validator = ajvRestartRequiredDeviceOptions;
    }
    else if (getGroup(IDorName)) {
        (0, object_assign_deep_1.default)(settings.groups[getGroup(IDorName).ID], newOptions);
        utils_1.default.removeNullPropertiesFromObject(settings.groups[getGroup(IDorName).ID], NULLABLE_SETTINGS);
        validator = ajvRestartRequiredGroupOptions;
    }
    else {
        throw new Error(`Device or group '${IDorName}' does not exist`);
    }
    write();
    validator(newOptions);
    const restartRequired = validator.errors && !!validator.errors.find((e) => e.keyword === 'requiresRestart');
    return restartRequired;
}
function changeFriendlyName(IDorName, newName) {
    utils_1.default.validateFriendlyName(newName, true);
    if (getGroup(newName) || getDevice(newName)) {
        throw new Error(`friendly_name '${newName}' is already in use`);
    }
    const settings = getInternalSettings();
    if (getDevice(IDorName)) {
        settings.devices[getDevice(IDorName).ID].friendly_name = newName;
    }
    else if (getGroup(IDorName)) {
        settings.groups[getGroup(IDorName).ID].friendly_name = newName;
    }
    else {
        throw new Error(`Device or group '${IDorName}' does not exist`);
    }
    write();
}
function reRead() {
    _settings = null;
    getInternalSettings();
    _settingsWithDefaults = null;
    get();
}
exports.testing = {
    write,
    clear: () => {
        _settings = null;
        _settingsWithDefaults = null;
    },
    defaults,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvdXRpbC9zZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUEyUkEsNEJBZ0ZDO0FBa0hELGtCQU1DO0FBRUQsa0JBa0JDO0FBRUQsc0JBa0JDO0FBRUQsNEJBY0M7QUFFRCw4QkFLQztBQVdELDhCQWNDO0FBV0QsOEJBY0M7QUFFRCxrREFZQztBQUVELGtDQVFDO0FBRUQsb0NBY0M7QUFFRCw0QkE2QkM7QUFVRCw0Q0FVQztBQUVELHNEQWFDO0FBRUQsa0NBS0M7QUFFRCxrREFxQkM7QUFFRCxnREFnQkM7QUFFRCx3QkFLQztBQXJ2QkQsOENBQTBDO0FBQzFDLDRFQUFrRDtBQUNsRCxnREFBd0I7QUFFeEIsa0RBQTBCO0FBQzFCLGtGQUFnRDtBQUNoRCxvREFBNEI7QUFDNUIsa0RBQTBCO0FBQ2YsUUFBQSxNQUFNLEdBQUcsOEJBQVUsQ0FBQztBQUMvQixtQkFBbUI7QUFDbkIsY0FBTSxHQUFHLEVBQUUsQ0FBQztBQUNaLElBQUEsNEJBQWdCLEVBQUMsY0FBTSxFQUFFLDhCQUFVLENBQUMsQ0FBQztBQUVyQyxxQ0FBcUM7QUFDckMsQ0FBQztJQUNHLE9BQU8sY0FBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLDZCQUE2QixDQUFDO0lBQzNFLE9BQU8sY0FBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLHNDQUFzQyxDQUFDO0lBQ3BGLE9BQU8sY0FBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLDZCQUE2QixDQUFDO0lBQzNFLE9BQU8sY0FBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLDBCQUEwQixDQUFDO0lBQ3hFLE9BQU8sY0FBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDO0lBQ2hFLE9BQU8sY0FBTSxDQUFDLFVBQVUs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