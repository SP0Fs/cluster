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
const es6_1 = __importDefault(require("fast-deep-equal/es6"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const device_1 = __importDefault(require("../model/device"));
const group_1 = __importDefault(require("../model/group"));
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
const TOPIC_REGEX = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/group/members/(remove|add|remove_all)$`);
const LEGACY_TOPIC_REGEX = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/(.+)/(remove|add|remove_all)$`);
const LEGACY_TOPIC_REGEX_REMOVE_ALL = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/group/remove_all$`);
const STATE_PROPERTIES = {
    state: () => true,
    brightness: (value, exposes) => exposes.some((e) => e.type === 'light' && e.features.some((f) => f.name === 'brightness')),
    color_temp: (value, exposes) => exposes.some((e) => e.type === 'light' && e.features.some((f) => f.name === 'color_temp')),
    color: (value, exposes) => exposes.some((e) => e.type === 'light' && e.features.some((f) => f.name === 'color_xy' || f.name === 'color_hs')),
    color_mode: (value, exposes) => exposes.some((e) => e.type === 'light' &&
        (e.features.some((f) => f.name === `color_${value}`) || (value === 'color_temp' && e.features.some((f) => f.name === 'color_temp')))),
};
class Groups extends extension_1.default {
    legacyApi = settings.get().advanced.legacy_api;
    lastOptimisticState = {};
    async start() {
        this.eventBus.onStateChange(this, this.onStateChange);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        await this.syncGroupsWithSettings();
    }
    async syncGroupsWithSettings() {
        const settingsGroups = settings.getGroups();
        const addRemoveFromGroup = async (action, deviceName, groupName, endpoint, group) => {
            try {
                logger_1.default.info(`${action === 'add' ? 'Adding' : 'Removing'} '${deviceName}' to group '${groupName}'`);
                if (action === 'remove') {
                    await endpoint.removeFromGroup(group.zh);
                }
                else {
                    await endpoint.addToGroup(group.zh);
                }
            }
            catch (error) {
                logger_1.default.error(`Failed to ${action} '${deviceName}' from '${groupName}'`);
                logger_1.default.debug(error.stack);
            }
        };
        for (const settingGroup of settingsGroups) {
            const groupID = settingGroup.ID;
            const zigbeeGroup = this.zigbee.groupsIterator((g) => g.groupID === groupID).next().value || this.zigbee.createGroup(groupID);
            const settingsEndpoints = [];
            for (const d of settingGroup.devices) {
                const parsed = this.zigbee.resolveEntityAndEndpoint(d);
                const device = parsed.entity;
                if (!device) {
                    logger_1.default.error(`Cannot find '${d}' of group '${settingGroup.friendly_name}'`);
                }
                if (!parsed.endpoint) {
                    if (parsed.endpointID) {
                        logger_1.default.error(`Cannot find endpoint '${parsed.endpointID}' of device '${parsed.ID}'`);
                    }
                    continue;
                }
                // In settings but not in zigbee
                if (!zigbeeGroup.zh.hasMember(parsed.endpoint)) {
                    await addRemoveFromGroup('add', device?.name, settingGroup.friendly_name, parsed.endpoint, zigbeeGroup);
                }
                settingsEndpoints.push(parsed.endpoint);
            }
            // In zigbee but not in settings
            for (const endpoint of zigbeeGroup.zh.members) {
                if (!settingsEndpoints.includes(endpoint)) {
                    const deviceName = settings.getDevice(endpoint.getDevice().ieeeAddr).friendly_name;
                    await addRemoveFromGroup('remove', deviceName, settingGroup.friendly_name, endpoint, zigbeeGroup);
                }
            }
        }
        for (const zigbeeGroup of this.zigbee.groupsIterator((zg) => !settingsGroups.some((sg) => sg.ID === zg.groupID))) {
            for (const endpoint of zigbeeGroup.zh.members) {
                const deviceName = settings.getDevice(endpoint.getDevice().ieeeAddr).friendly_name;
                await addRemoveFromGroup('remove', deviceName, zigbeeGroup.ID, endpoint, zigbeeGroup);
            }
        }
    }
    async onStateChange(data) {
        const reason = 'groupOptimistic';
        if (data.reason === reason || data.reason === 'publishCached') {
            return;
        }
        const payload = {};
        let endpointName = null;
        const endpointNames = data.entity instanceof device_1.default ? data.entity.getEndpointNames() : [];
        for (let prop of Object.keys(data.update)) {
            const value = data.update[prop];
            const endpointNameMatch = endpointNames.find((n) => prop.endsWith(`_${n}`));
            if (endpointNameMatch) {
                prop = prop.substring(0, prop.length - endpointNameMatch.length - 1);
                endpointName = endpointNameMatch;
            }
            if (prop in STATE_PROPERTIES) {
                payload[prop] = value;
            }
        }
        const payloadKeys = Object.keys(payload);
        if (payloadKeys.length) {
            const entity = data.entity;
            const groups = [];
            for (const group of this.zigbee.groupsIterator()) {
                if (group.options && (group.options.optimistic == undefined || group.options.optimistic)) {
                    groups.push(group);
                }
            }
            if (entity instanceof device_1.default) {
                for (const group of groups) {
                    if (group.zh.hasMember(entity.endpoint(endpointName)) &&
                        !(0, es6_1.default)(this.lastOptimisticState[group.ID], payload) &&
                        this.shouldPublishPayloadForGroup(group, payload)) {
                        this.lastOptimisticState[group.ID] = payload;
                        await this.publishEntityState(group, payload, reason);
                    }
                }
            }
            else {
                // Invalidate the last optimistic group state when group state is changed directly.
                delete this.lastOptimisticState[entity.ID];
                const groupsToPublish = new Set();
                for (const member of entity.zh.members) {
                    const device = this.zigbee.resolveEntity(member.getDevice());
                    if (device.options.disabled) {
                        continue;
                    }
                    const exposes = device.exposes();
                    const memberPayload = {};
                    for (const key of payloadKeys) {
                        if (STATE_PROPERTIES[key](payload[key], exposes)) {
                            memberPayload[key] = payload[key];
                        }
                    }
                    const endpointName = device.endpointName(member);
                    if (endpointName) {
                        for (const key of Object.keys(memberPayload)) {
                            memberPayload[`${key}_${endpointName}`] = memberPayload[key];
                            delete memberPayload[key];
                        }
                    }
                    await this.publishEntityState(device, memberPayload, reason);
                    for (const zigbeeGroup of groups) {
                        if (zigbeeGroup.zh.hasMember(member) && this.shouldPublishPayloadForGroup(zigbeeGroup, payload)) {
                            groupsToPublish.add(zigbeeGroup);
                        }
                    }
                }
                groupsToPublish.delete(entity);
                for (const group of groupsToPublish) {
                    await this.publishEntityState(group, payload, reason);
                }
            }
        }
    }
    shouldPublishPayloadForGroup(group, payload) {
        return group.options.off_state === 'last_member_state' || !payload || payload.state !== 'OFF' || this.areAllMembersOff(group);
    }
    areAllMembersOff(group) {
        for (const member of group.zh.members) {
            const device = this.zigbee.resolveEntity(member.getDevice());
            if (this.state.exists(device)) {
                const state = this.state.get(device);
                if (state.state === 'ON') {
                    return false;
                }
            }
        }
        return true;
    }
    async parseMQTTMessage(data) {
        let type = null;
        let resolvedEntityGroup = null;
        let resolvedEntityDevice = null;
        let resolvedEntityEndpoint = null;
        let error = null;
        let groupKey = null;
        let deviceKey = null;
        let triggeredViaLegacyApi = false;
        let skipDisableReporting = false;
        /* istanbul ignore else */
        const topicRegexMatch = data.topic.match(TOPIC_REGEX);
        const legacyTopicRegexRemoveAllMatch = data.topic.match(LEGACY_TOPIC_REGEX_REMOVE_ALL);
        const legacyTopicRegexMatch = data.topic.match(LEGACY_TOPIC_REGEX);
        if (this.legacyApi && (legacyTopicRegexMatch || legacyTopicRegexRemoveAllMatch)) {
            triggeredViaLegacyApi = true;
            if (legacyTopicRegexMatch) {
                resolvedEntityGroup = this.zigbee.resolveEntity(legacyTopicRegexMatch[1]);
                type = legacyTopicRegexMatch[2];
                if (!resolvedEntityGroup || !(resolvedEntityGroup instanceof group_1.default)) {
                    logger_1.default.error(`Group '${legacyTopicRegexMatch[1]}' does not exist`);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const message = { friendly_name: data.message, group: legacyTopicRegexMatch[1], error: `group doesn't exists` };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_${type}_failed`, message }));
                    }
                    return null;
                }
            }
            else {
                type = 'remove_all';
            }
            const parsedEntity = this.zigbee.resolveEntityAndEndpoint(data.message);
            resolvedEntityDevice = parsedEntity.entity;
            if (!resolvedEntityDevice || !(resolvedEntityDevice instanceof device_1.default)) {
                logger_1.default.error(`Device '${data.message}' does not exist`);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const message = { friendly_name: data.message, group: legacyTopicRegexMatch[1], error: "entity doesn't exists" };
                    await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_${type}_failed`, message }));
                }
                return null;
            }
            resolvedEntityEndpoint = parsedEntity.endpoint;
            if (parsedEntity.endpointID && !resolvedEntityEndpoint) {
                logger_1.default.error(`Device '${parsedEntity.ID}' does not have endpoint '${parsedEntity.endpointID}'`);
                return null;
            }
        }
        else if (topicRegexMatch) {
            type = topicRegexMatch[1];
            const message = JSON.parse(data.message);
            deviceKey = message.device;
            skipDisableReporting = 'skip_disable_reporting' in message ? message.skip_disable_reporting : false;
            if (type !== 'remove_all') {
                groupKey = message.group;
                resolvedEntityGroup = this.zigbee.resolveEntity(message.group);
                if (!resolvedEntityGroup || !(resolvedEntityGroup instanceof group_1.default)) {
                    error = `Group '${message.group}' does not exist`;
                }
            }
            const parsed = this.zigbee.resolveEntityAndEndpoint(message.device);
            resolvedEntityDevice = parsed?.entity;
            if (!error && (!resolvedEntityDevice || !(resolvedEntityDevice instanceof device_1.default))) {
                error = `Device '${message.device}' does not exist`;
            }
            if (!error) {
                resolvedEntityEndpoint = parsed.endpoint;
                if (parsed.endpointID && !resolvedEntityEndpoint) {
                    error = `Device '${parsed.ID}' does not have endpoint '${parsed.endpointID}'`;
                }
            }
        }
        return {
            resolvedEntityGroup,
            resolvedEntityDevice,
            type,
            error,
            groupKey,
            deviceKey,
            triggeredViaLegacyApi,
            skipDisableReporting,
            resolvedEntityEndpoint,
        };
    }
    async onMQTTMessage(data) {
        const parsed = await this.parseMQTTMessage(data);
        if (!parsed || !parsed.type) {
            return;
        }
        const { resolvedEntityGroup, resolvedEntityDevice, type, triggeredViaLegacyApi, groupKey, deviceKey, skipDisableReporting, resolvedEntityEndpoint, } = parsed;
        let error = parsed.error;
        const changedGroups = [];
        if (!error) {
            try {
                const keys = [
                    `${resolvedEntityDevice.ieeeAddr}/${resolvedEntityEndpoint.ID}`,
                    `${resolvedEntityDevice.name}/${resolvedEntityEndpoint.ID}`,
                ];
                const endpointNameLocal = resolvedEntityDevice.endpointName(resolvedEntityEndpoint);
                if (endpointNameLocal) {
                    keys.push(`${resolvedEntityDevice.ieeeAddr}/${endpointNameLocal}`);
                    keys.push(`${resolvedEntityDevice.name}/${endpointNameLocal}`);
                }
                if (!endpointNameLocal) {
                    keys.push(resolvedEntityDevice.name);
                    keys.push(resolvedEntityDevice.ieeeAddr);
                }
                if (type === 'add') {
                    logger_1.default.info(`Adding '${resolvedEntityDevice.name}' to '${resolvedEntityGroup.name}'`);
                    await resolvedEntityEndpoint.addToGroup(resolvedEntityGroup.zh);
                    settings.addDeviceToGroup(resolvedEntityGroup.ID.toString(), keys);
                    changedGroups.push(resolvedEntityGroup);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const message = { friendly_name: resolvedEntityDevice.name, group: resolvedEntityGroup.name };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_add`, message }));
                    }
                }
                else if (type === 'remove') {
                    logger_1.default.info(`Removing '${resolvedEntityDevice.name}' from '${resolvedEntityGroup.name}'`);
                    await resolvedEntityEndpoint.removeFromGroup(resolvedEntityGroup.zh);
                    settings.removeDeviceFromGroup(resolvedEntityGroup.ID.toString(), keys);
                    changedGroups.push(resolvedEntityGroup);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const message = { friendly_name: resolvedEntityDevice.name, group: resolvedEntityGroup.name };
                        await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_remove`, message }));
                    }
                }
                else {
                    // remove_all
                    logger_1.default.info(`Removing '${resolvedEntityDevice.name}' from all groups`);
                    for (const group of this.zigbee.groupsIterator((g) => g.members.includes(resolvedEntityEndpoint))) {
                        changedGroups.push(group);
                    }
                    await resolvedEntityEndpoint.removeFromAllGroups();
                    for (const settingsGroup of settings.getGroups()) {
                        settings.removeDeviceFromGroup(settingsGroup.ID.toString(), keys);
                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            const message = { friendly_name: resolvedEntityDevice.name };
                            await this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_group_remove_all`, message }));
                        }
                    }
                }
            }
            catch (e) {
                error = `Failed to ${type} from group (${e.message})`;
                logger_1.default.debug(e.stack);
            }
        }
        if (!triggeredViaLegacyApi) {
            const message = utils_1.default.parseJSON(data.message, data.message);
            const responseData = { device: deviceKey };
            if (groupKey) {
                responseData.group = groupKey;
            }
            await this.mqtt.publish(`bridge/response/group/members/${type}`, (0, json_stable_stringify_without_jsonify_1.default)(utils_1.default.getResponse(message, responseData, error)));
        }
        if (error) {
            logger_1.default.error(error);
        }
        else {
            for (const group of changedGroups) {
                this.eventBus.emitGroupMembersChanged({ group, action: type, endpoint: resolvedEntityEndpoint, skipDisableReporting });
            }
        }
    }
}
exports.default = Groups;
__decorate([
    bind_decorator_1.default
], Groups.prototype, "onStateChange", null);
__decorate([
    bind_decorator_1.default
], Groups.prototype, "onMQTTMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXBzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9ncm91cHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLG9FQUFrQztBQUNsQyw4REFBeUM7QUFDekMsa0hBQThEO0FBRzlELDZEQUFxQztBQUNyQywyREFBbUM7QUFDbkMsNERBQW9DO0FBQ3BDLDJEQUE2QztBQUM3QywwREFBa0M7QUFDbEMsNERBQW9DO0FBRXBDLE1BQU0sV0FBVyxHQUFHLElBQUksTUFBTSxDQUFDLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLHdEQUF3RCxDQUFDLENBQUM7QUFDM0gsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSw2Q0FBNkMsQ0FBQyxDQUFDO0FBQ3ZILE1BQU0sNkJBQTZCLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsMkJBQTJCLENBQUMsQ0FBQztBQUVoSCxNQUFNLGdCQUFnQixHQUFnRjtJQUNsRyxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSTtJQUNqQixVQUFVLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxZQUFZLENBQUMsQ0FBQztJQUMxSCxVQUFVLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMs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