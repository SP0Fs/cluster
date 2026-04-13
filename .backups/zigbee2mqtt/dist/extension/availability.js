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
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
const RETRIEVE_ON_RECONNECT = [
    { keys: ['state'] },
    { keys: ['brightness'], condition: (state) => state.state === 'ON' },
    { keys: ['color', 'color_temp'], condition: (state) => state.state === 'ON' },
];
class Availability extends extension_1.default {
    timers = {};
    availabilityCache = {};
    retrieveStateDebouncers = {};
    pingQueue = [];
    pingQueueExecuting = false;
    stopped = false;
    getTimeout(device) {
        if (typeof device.options.availability === 'object' && device.options.availability?.timeout != null) {
            return utils_1.default.minutes(device.options.availability.timeout);
        }
        const key = this.isActiveDevice(device) ? 'active' : 'passive';
        let value = settings.get().availability?.[key]?.timeout;
        if (value == null) {
            value = key == 'active' ? 10 : 1500;
        }
        return utils_1.default.minutes(value);
    }
    isActiveDevice(device) {
        return (device.zh.type === 'Router' && device.zh.powerSource !== 'Battery') || device.zh.powerSource === 'Mains (single phase)';
    }
    isAvailable(entity) {
        return entity.isDevice()
            ? Date.now() - entity.zh.lastSeen < this.getTimeout(entity)
            : entity.membersDevices().length === 0 || entity.membersDevices().some((d) => this.availabilityCache[d.ieeeAddr]);
    }
    resetTimer(device) {
        clearTimeout(this.timers[device.ieeeAddr]);
        this.removeFromPingQueue(device);
        // If the timer triggers, the device is not available anymore otherwise resetTimer already has been called
        if (this.isActiveDevice(device)) {
            // If device did not check in, ping it, if that fails it will be marked as offline
            this.timers[device.ieeeAddr] = setTimeout(() => this.addToPingQueue(device), this.getTimeout(device) + utils_1.default.seconds(1));
        }
        else {
            this.timers[device.ieeeAddr] = setTimeout(() => this.publishAvailability(device, true), this.getTimeout(device) + utils_1.default.seconds(1));
        }
    }
    addToPingQueue(device) {
        this.pingQueue.push(device);
        this.pingQueueExecuteNext().catch(utils_1.default.noop);
    }
    removeFromPingQueue(device) {
        const index = this.pingQueue.findIndex((d) => d.ieeeAddr === device.ieeeAddr);
        if (index != -1) {
            this.pingQueue.splice(index, 1);
        }
    }
    async pingQueueExecuteNext() {
        if (this.pingQueue.length === 0 || this.pingQueueExecuting) {
            return;
        }
        this.pingQueueExecuting = true;
        const device = this.pingQueue[0];
        let pingedSuccessfully = false;
        const available = this.availabilityCache[device.ieeeAddr] || this.isAvailable(device);
        const attempts = available ? 2 : 1;
        for (let i = 1; i <= attempts; i++) {
            try {
                // Enable recovery if device is marked as available and first ping fails.
                await device.zh.ping(!available || i !== 2);
                pingedSuccessfully = true;
                logger_1.default.debug(`Successfully pinged '${device.name}' (attempt ${i}/${attempts})`);
                break;
            }
            catch (error) {
                logger_1.default.warning(`Failed to ping '${device.name}' (attempt ${i}/${attempts}, ${error.message})`);
                // Try again in 3 seconds.
                if (i !== attempts) {
                    await utils_1.default.sleep(3);
                }
            }
        }
        if (this.stopped) {
            // Exit here to avoid triggering any follow-up activity (e.g., re-queuing another ping attempt).
            return;
        }
        await this.publishAvailability(device, !pingedSuccessfully);
        this.resetTimer(device);
        this.removeFromPingQueue(device);
        // Sleep 2 seconds before executing next ping
        await utils_1.default.sleep(2);
        this.pingQueueExecuting = false;
        await this.pingQueueExecuteNext();
    }
    async start() {
        if (this.stopped) {
            throw new Error('This extension cannot be restarted.');
        }
        this.eventBus.onEntityRenamed(this, async (data) => {
            if (utils_1.default.isAvailabilityEnabledForEntity(data.entity, settings.get())) {
                await this.mqtt.publish(`${data.from}/availability`, null, { retain: true, qos: 1 });
                await this.publishAvailability(data.entity, false, true);
            }
        });
        this.eventBus.onEntityRemoved(this, (data) => data.type == 'device' && clearTimeout(this.timers[data.id]));
        this.eventBus.onDeviceLeave(this, (data) => clearTimeout(this.timers[data.ieeeAddr]));
        this.eventBus.onDeviceAnnounce(this, (data) => this.retrieveState(data.device));
        this.eventBus.onLastSeenChanged(this, this.onLastSeenChanged);
        this.eventBus.onPublishAvailability(this, this.publishAvailabilityForAllEntities);
        this.eventBus.onGroupMembersChanged(this, (data) => this.publishAvailability(data.group, false));
        // Publish initial availability
        await this.publishAvailabilityForAllEntities();
        // Start availability for the devices
        for (const device of this.zigbee.devicesIterator(utils_1.default.deviceNotCoordinator)) {
            if (utils_1.default.isAvailabilityEnabledForEntity(device, settings.get())) {
                this.resetTimer(device);
                // If an active device is unavailable on start, add it to the pingqueue immediately.
                if (this.isActiveDevice(device) && !this.isAvailable(device)) {
                    this.addToPingQueue(device);
                }
            }
        }
    }
    async publishAvailabilityForAllEntities() {
        for (const entity of this.zigbee.devicesAndGroupsIterator(utils_1.default.deviceNotCoordinator)) {
            if (utils_1.default.isAvailabilityEnabledForEntity(entity, settings.get())) {
                await this.publishAvailability(entity, true, false, true);
            }
        }
    }
    async publishAvailability(entity, logLastSeen, forcePublish = false, skipGroups = false) {
        if (logLastSeen && entity.isDevice()) {
            const ago = Date.now() - entity.zh.lastSeen;
            if (this.isActiveDevice(entity)) {
                logger_1.default.debug(`Active device '${entity.name}' was last seen '${(ago / utils_1.default.minutes(1)).toFixed(2)}' minutes ago.`);
            }
            else {
                logger_1.default.debug(`Passive device '${entity.name}' was last seen '${(ago / utils_1.default.hours(1)).toFixed(2)}' hours ago.`);
            }
        }
        const available = this.isAvailable(entity);
        if (!forcePublish && this.availabilityCache[entity.ID] == available) {
            return;
        }
        if (entity.isDevice() && entity.ieeeAddr in this.availabilityCache && available && this.availabilityCache[entity.ieeeAddr] === false) {
            logger_1.default.debug(`Device '${entity.name}' reconnected`);
            this.retrieveState(entity);
        }
        const topic = `${entity.name}/availability`;
        const payload = utils_1.default.availabilityPayload(available ? 'online' : 'offline', settings.get());
        this.availabilityCache[entity.ID] = available;
        await this.mqtt.publish(topic, payload, { retain: true, qos: 1 });
        if (!skipGroups && entity.isDevice()) {
            for (const group of this.zigbee.groupsIterator()) {
                if (group.hasMember(entity) && utils_1.default.isAvailabilityEnabledForEntity(group, settings.get())) {
                    await this.publishAvailability(group, false, forcePublish);
                }
            }
        }
    }
    async onLastSeenChanged(data) {
        if (utils_1.default.isAvailabilityEnabledForEntity(data.device, settings.get())) {
            // Remove from ping queue, not necessary anymore since we know the device is online.
            this.removeFromPingQueue(data.device);
            this.resetTimer(data.device);
            await this.publishAvailability(data.device, false);
        }
    }
    async stop() {
        this.stopped = true;
        this.pingQueue = [];
        for (const t of Object.values(this.timers)) {
            clearTimeout(t);
        }
        await super.stop();
    }
    retrieveState(device) {
        /**
         * Retrieve state of a device in a debounced manner, this function is called on a 'deviceAnnounce' which a
         * device can send multiple times after each other.
         */
        if (device.definition && !device.zh.interviewing && !this.retrieveStateDebouncers[device.ieeeAddr]) {
            this.retrieveStateDebouncers[device.ieeeAddr] = (0, debounce_1.default)(async () => {
                logger_1.default.debug(`Retrieving state of '${device.name}' after reconnect`);
                // Color and color temperature converters do both, only needs to be called once.
                for (const item of RETRIEVE_ON_RECONNECT) {
                    if (item.condition && this.state.get(device) && !item.condition(this.state.get(device))) {
                        continue;
                    }
                    const converter = device.definition.toZigbee.find((c) => !c.key || c.key.find((k) => item.keys.includes(k)));
                    const options = device.options;
                    const state = this.state.get(device);
                    const meta = {
                        message: this.state.get(device),
                        mapped: device.definition,
                        endpoint_name: null,
                        options,
                        state,
                        device: device.zh,
                    };
                    try {
                        await converter?.convertGet?.(device.endpoint(), item.keys[0], meta);
                    }
                    catch (error) {
                        logger_1.default.error(`Failed to read state of '${device.name}' after reconnect (${error.message})`);
                    }
                    await utils_1.default.sleep(500);
                }
            }, utils_1.default.seconds(2));
        }
        this.retrieveStateDebouncers[device.ieeeAddr]?.();
    }
}
exports.default = Availability;
__decorate([
    bind_decorator_1.default
], Availability.prototype, "publishAvailabilityForAllEntities", null);
__decorate([
    bind_decorator_1.default
], Availability.prototype, "onLastSeenChanged", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXZhaWxhYmlsaXR5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9hdmFpbGFiaWxpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLG9FQUFrQztBQUNsQyx3REFBZ0M7QUFHaEMsNERBQW9DO0FBQ3BDLDJEQUE2QztBQUM3QywwREFBa0M7QUFDbEMsNERBQW9DO0FBRXBDLE1BQU0scUJBQXFCLEdBQTBFO0lBQ2pHLEVBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUM7SUFDakIsRUFBQyxJQUFJLEVBQUUsQ0FBQyxZQUFZLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxLQUFlLEVBQVcsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLEtBQUssSUFBSSxFQUFDO0lBQ3JGLEVBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEtBQWUsRUFBVyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssS0FBSyxJQUFJLEVBQUM7Q0FDakcsQ0FBQztBQUVGLE1BQXFCLFlBQWEsU0FBUSxtQkFBUztJQUN2QyxNQUFNLEdBQWtDLEVBQUUsQ0FBQztJQUMzQyxpQkFBaUIsR0FBMkIsRUFBRSxDQUFDO0lBQy9DLHVCQUF1QixHQUE4QixFQUFFLENBQUM7SUFDeEQsU0FBUyxHQUFhLEVBQUUsQ0FBQztJQUN6QixrQkFBa0IsR0FBRyxLQUFLLENBQUM7SUFDM0IsT0FBTyxHQUFHLEtBQUssQ0FBQztJQUVoQixVQUFVLENBQUMsTUFBYztRQUM3QixJQUFJLE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEtBQUssUUFBUSxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLE9BQU8sSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUNsRyxPQUFPLGVBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFD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