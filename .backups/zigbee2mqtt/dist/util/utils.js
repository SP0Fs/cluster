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
exports.loadExternalConverter = loadExternalConverter;
exports.isNumericExposeFeature = isNumericExposeFeature;
exports.isEnumExposeFeature = isEnumExposeFeature;
exports.isBinaryExposeFeature = isBinaryExposeFeature;
const es6_1 = __importDefault(require("fast-deep-equal/es6"));
const fs_1 = __importDefault(require("fs"));
const humanize_duration_1 = __importDefault(require("humanize-duration"));
const path_1 = __importDefault(require("path"));
const vm_1 = __importDefault(require("vm"));
const data_1 = __importDefault(require("./data"));
// construct a local ISO8601 string (instead of UTC-based)
// Example:
//  - ISO8601 (UTC) = 2019-03-01T15:32:45.941+0000
//  - ISO8601 (local) = 2019-03-01T16:32:45.941+0100 (for timezone GMT+1)
function toLocalISOString(date) {
    const tzOffset = -date.getTimezoneOffset();
    const plusOrMinus = tzOffset >= 0 ? '+' : '-';
    const pad = (num) => {
        const norm = Math.floor(Math.abs(num));
        return (norm < 10 ? '0' : '') + norm;
    };
    return (date.getFullYear() +
        '-' +
        pad(date.getMonth() + 1) +
        '-' +
        pad(date.getDate()) +
        'T' +
        pad(date.getHours()) +
        ':' +
        pad(date.getMinutes()) +
        ':' +
        pad(date.getSeconds()) +
        plusOrMinus +
        pad(tzOffset / 60) +
        ':' +
        pad(tzOffset % 60));
}
function capitalize(s) {
    return s[0].toUpperCase() + s.slice(1);
}
async function getZigbee2MQTTVersion(includeCommitHash = true) {
    const git = await Promise.resolve().then(() => __importStar(require('git-last-commit')));
    const packageJSON = await Promise.resolve(`${'../..' + '/package.json'}`).then(s => __importStar(require(s)));
    if (!includeCommitHash) {
        return { version: packageJSON.version, commitHash: null };
    }
    return new Promise((resolve) => {
        const version = packageJSON.version;
        git.getLastCommit((err, commit) => {
            let commitHash = null;
            if (err) {
                try {
                    commitHash = fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'dist', '.hash'), 'utf-8');
                }
                catch {
                    /* istanbul ignore next */
                    commitHash = 'unknown';
                }
            }
            else {
                commitHash = commit.shortHash;
            }
            commitHash = commitHash.trim();
            resolve({ commitHash, version });
        });
    });
}
async function getDependencyVersion(depend) {
    const modulePath = path_1.default.dirname(require.resolve(depend));
    const packageJSONPath = path_1.default.join(modulePath.slice(0, modulePath.indexOf(depend) + depend.length), 'package.json');
    const packageJSON = await Promise.resolve(`${packageJSONPath}`).then(s => __importStar(require(s)));
    const version = packageJSON.version;
    return { version };
}
function formatDate(time, type) {
    if (type === 'ISO_8601')
        return new Date(time).toISOString();
    else if (type === 'ISO_8601_local')
        return toLocalISOString(new Date(time));
    else if (type === 'epoch')
        return time;
    else {
        // relative
        return (0, humanize_duration_1.default)(Date.now() - time, { language: 'en', largest: 2, round: true }) + ' ago';
    }
}
function objectIsEmpty(object) {
    // much faster than checking `Object.keys(object).length`
    for (const k in object)
        return false;
    return true;
}
function objectHasProperties(object, properties) {
    for (const property of properties) {
        if (!object.hasOwnProperty(property)) {
            return false;
        }
    }
    return true;
}
function equalsPartial(object, expected) {
    for (const [key, value] of Object.entries(expected)) {
        if (!(0, es6_1.default)(object[key], value)) {
            return false;
        }
    }
    return true;
}
function getObjectProperty(object, key, defaultValue) {
    return object && object.hasOwnProperty(key) ? object[key] : defaultValue;
}
function getResponse(request, data, error) {
    const response = { data, status: error ? 'error' : 'ok' };
    if (error)
        response.error = error;
    if (typeof request === 'object' && request.hasOwnProperty('transaction')) {
        response.transaction = request.transaction;
    }
    return response;
}
function parseJSON(value, fallback) {
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function loadModuleFromText(moduleCode, name) {
    const moduleFakePath = path_1.default.join(__dirname, '..', '..', 'data', 'extension', name || 'externally-loaded.js');
    const sandbox = {
        require: require,
        module: {},
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        setImmediate,
        clearImmediate,
    };
    vm_1.default.runInNewContext(moduleCode, sandbox, moduleFakePath);
    /* eslint-disable-line */ // @ts-ignore
    return sandbox.module.exports;
}
function loadModuleFromFile(modulePath) {
    const moduleCode = fs_1.default.readFileSync(modulePath, { encoding: 'utf8' });
    return loadModuleFromText(moduleCode);
}
function* loadExternalConverter(moduleName) {
    let converter;
    if (moduleName.endsWith('.js')) {
        converter = loadModuleFromFile(data_1.default.joinPath(moduleName));
    }
    else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        converter = require(moduleName);
    }
    if (Array.isArray(converter)) {
        for (const item of converter) {
            yield item;
        }
    }
    else {
        yield converter;
    }
}
/**
 * Delete all keys from passed object that have null/undefined values.
 *
 * @param {KeyValue} obj Object to process (in-place)
 * @param {string[]} [ignoreKeys] Recursively ignore these keys in the object (keep null/undefined values).
 */
function removeNullPropertiesFromObject(obj, ignoreKeys = []) {
    for (const key of Object.keys(obj)) {
        if (ignoreKeys.includes(key))
            continue;
        const value = obj[key];
        if (value == null) {
            delete obj[key];
        }
        else if (typeof value === 'object') {
            removeNullPropertiesFromObject(value, ignoreKeys);
        }
    }
}
function toNetworkAddressHex(value) {
    const hex = value.toString(16);
    return `0x${'0'.repeat(4 - hex.length)}${hex}`;
}
// eslint-disable-next-line
function toSnakeCase(value) {
    if (typeof value === 'object') {
        value = { ...value };
        for (const key of Object.keys(value)) {
            const keySnakeCase = toSnakeCase(key);
            if (key !== keySnakeCase) {
                value[keySnakeCase] = value[key];
                delete value[key];
            }
        }
        return value;
    }
    else {
        return value
            .replace(/\.?([A-Z])/g, (x, y) => '_' + y.toLowerCase())
            .replace(/^_/, '')
            .replace('_i_d', '_id');
    }
}
function charRange(start, stop) {
    const result = [];
    for (let idx = start.charCodeAt(0), end = stop.charCodeAt(0); idx <= end; ++idx) {
        result.push(idx);
    }
    return result;
}
const controlCharacters = [...charRange('\u0000', '\u001F'), ...charRange('\u007f', '\u009F'), ...charRange('\ufdd0', '\ufdef')];
function containsControlCharacter(str) {
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        if (controlCharacters.includes(ch) || [0xfffe, 0xffff].includes(ch & 0xffff)) {
            return true;
        }
    }
    return false;
}
function getAllFiles(path_) {
    const result = [];
    for (let item of fs_1.default.readdirSync(path_)) {
        item = path_1.default.join(path_, item);
        if (fs_1.default.lstatSync(item).isFile()) {
            result.push(item);
        }
        else {
            result.push(...getAllFiles(item));
        }
    }
    return result;
}
function validateFriendlyName(name, throwFirstError = false) {
    const errors = [];
    if (name.length === 0)
        errors.push(`friendly_name must be at least 1 char long`);
    if (name.endsWith('/') || name.startsWith('/'))
        errors.push(`friendly_name is not allowed to end or start with /`);
    if (containsControlCharacter(name))
        errors.push(`friendly_name is not allowed to contain control char`);
    if (name.match(/.*\/\d*$/))
        errors.push(`Friendly name cannot end with a "/DIGIT" ('${name}')`);
    if (name.includes('#') || name.includes('+')) {
        errors.push(`MQTT wildcard (+ and #) not allowed in friendly_name ('${name}')`);
    }
    if (throwFirstError && errors.length) {
        throw new Error(errors[0]);
    }
    return errors;
}
function sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
function sanitizeImageParameter(parameter) {
    const replaceByDash = [/\?/g, /&/g, /[^a-z\d\- _./:]/gi];
    let sanitized = parameter;
    replaceByDash.forEach((r) => (sanitized = sanitized.replace(r, '-')));
    return sanitized;
}
function isAvailabilityEnabledForEntity(entity, settings) {
    if (entity.isDevice() && entity.options.disabled) {
        return false;
    }
    if (entity.isGroup()) {
        return !entity.membersDevices().some((d) => !isAvailabilityEnabledForEntity(d, settings));
    }
    if (entity.options.availability != null) {
        return !!entity.options.availability;
    }
    // availability_timeout = deprecated
    if (!(settings.advanced.availability_timeout || settings.availability)) {
        return false;
    }
    const passlist = settings.advanced.availability_passlist.concat(settings.advanced.availability_whitelist);
    if (passlist.length > 0) {
        return passlist.includes(entity.name) || passlist.includes(entity.ieeeAddr);
    }
    const blocklist = settings.advanced.availability_blacklist.concat(settings.advanced.availability_blocklist);
    if (blocklist.length > 0) {
        return !blocklist.includes(entity.name) && !blocklist.includes(entity.ieeeAddr);
    }
    return true;
}
function isEndpoint(obj) {
    return obj.constructor.name.toLowerCase() === 'endpoint';
}
function flatten(arr) {
    return [].concat(...arr);
}
function arrayUnique(arr) {
    return [...new Set(arr)];
}
function isZHGroup(obj) {
    return obj.constructor.name.toLowerCase() === 'group';
}
function availabilityPayload(state, settings) {
    return settings.advanced.legacy_availability_payload ? state : JSON.stringify({ state });
}
const hours = (hours) => 1000 * 60 * 60 * hours;
const minutes = (minutes) => 1000 * 60 * minutes;
const seconds = (seconds) => 1000 * seconds;
async function publishLastSeen(data, settings, allowMessageEmitted, publishEntityState) {
    /**
     * Prevent 2 MQTT publishes when 1 message event is received;
     * - In case reason == messageEmitted, receive.ts will only call this when it did not publish a
     *      message based on the received zigbee message. In this case allowMessageEmitted has to be true.
     * - In case reason !== messageEmitted, controller.ts will call this based on the zigbee-herdsman
     *      lastSeenChanged event.
     */
    const allow = data.reason !== 'messageEmitted' || (data.reason === 'messageEmitted' && allowMessageEmitted);
    if (settings.advanced.last_seen && settings.advanced.last_seen !== 'disable' && allow) {
        await publishEntityState(data.device, {}, 'lastSeenChanged');
    }
}
function filterProperties(filter, data) {
    if (filter) {
        for (const property of Object.keys(data)) {
            if (filter.find((p) => property.match(`^${p}$`))) {
                delete data[property];
            }
        }
    }
}
function isNumericExposeFeature(feature) {
    return feature?.type === 'numeric';
}
function isEnumExposeFeature(feature) {
    return feature?.type === 'enum';
}
function isBinaryExposeFeature(feature) {
    return feature?.type === 'binary';
}
function getScenes(entity) {
    const scenes = {};
    const endpoints = isEndpoint(entity) ? [entity] : entity.members;
    const groupID = isEndpoint(entity) ? 0 : entity.groupID;
    for (const endpoint of endpoints) {
        for (const [key, data] of Object.entries(endpoint.meta?.scenes || {})) {
            const split = key.split('_');
            const sceneID = parseInt(split[0], 10);
            const sceneGroupID = parseInt(split[1], 10);
            if (sceneGroupID === groupID) {
                scenes[sceneID] = { id: sceneID, name: data.name || `Scene ${sceneID}` };
            }
        }
    }
    return Object.values(scenes);
}
function deviceNotCoordinator(device) {
    return device.type !== 'Coordinator';
}
/* istanbul ignore next */
const noop = () => { };
exports.default = {
    capitalize,
    getZigbee2MQTTVersion,
    getDependencyVersion,
    formatDate,
    objectIsEmpty,
    objectHasProperties,
    equalsPartial,
    getObjectProperty,
    getResponse,
    parseJSON,
    loadModuleFromText,
    loadModuleFromFile,
    removeNullPropertiesFromObject,
    toNetworkAddressHex,
    toSnakeCase,
    isEndpoint,
    isZHGroup,
    hours,
    minutes,
    seconds,
    validateFriendlyName,
    sleep,
    sanitizeImageParameter,
    isAvailabilityEnabledForEntity,
    publishLastSeen,
    availabilityPayload,
    getAllFiles,
    filterProperties,
    flatten,
    arrayUnique,
    getScenes,
    deviceNotCoordinator,
    noop,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvdXRpbC91dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBb0tBLHNEQWlCQztBQWlNRCx3REFFQztBQUVELGtEQUVDO0FBRUQsc0RBRUM7QUE5WEQsOERBQXlDO0FBQ3pDLDRDQUFvQjtBQUNwQiwwRUFBaUQ7QUFDakQsZ0RBQXdCO0FBQ3hCLDRDQUFvQjtBQUVwQixrREFBMEI7QUFFMUIsMERBQTBEO0FBQzFELFdBQVc7QUFDWCxrREFBa0Q7QUFDbEQseUVBQXlFO0FBQ3pFLFNBQVMsZ0JBQWdCLENBQUMsSUFBVTtJQUNoQyxNQUFNLFFBQVEsR0FBRyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQzNDLE1BQU0sV0FBVyxHQUFHLFFBQVEsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO0lBQzlDLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBVyxFQUFVLEVBQUU7UUFDaEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDdkMsT0FBTyxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBQ3pDLENBQUMsQ0FBQztJQUVGLE9BQU8sQ0FDSCxJQUFJLENBQUMsV0FBVyxFQUFFO1FBQ2xCLEdBQUc7UUFDSCxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN4QixHQUFHO1FBQ0gsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQixHQUFHO1FBQ0gsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztR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