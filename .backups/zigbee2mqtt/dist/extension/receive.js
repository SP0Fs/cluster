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
const zhc = __importStar(require("zigbee-herdsman-converters"));
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
class Receive extends extension_1.default {
    elapsed = {};
    debouncers = {};
    async start() {
        this.eventBus.onPublishEntityState(this, this.onPublishEntityState);
        this.eventBus.onDeviceMessage(this, this.onDeviceMessage);
    }
    async onPublishEntityState(data) {
        /**
         * Prevent that outdated properties are being published.
         * In case that e.g. the state is currently held back by a debounce and a new state is published
         * remove it from the to be send debounced message.
         */
        if (data.entity.isDevice() &&
            this.debouncers[data.entity.ieeeAddr] &&
            data.stateChangeReason !== 'publishDebounce' &&
            data.stateChangeReason !== 'lastSeenChanged') {
            for (const key of Object.keys(data.payload)) {
                delete this.debouncers[data.entity.ieeeAddr].payload[key];
            }
        }
    }
    publishDebounce(device, payload, time, debounceIgnore) {
        if (!this.debouncers[device.ieeeAddr]) {
            this.debouncers[device.ieeeAddr] = {
                payload: {},
                publish: (0, debounce_1.default)(async () => {
                    await this.publishEntityState(device, this.debouncers[device.ieeeAddr].payload, 'publishDebounce');
                    this.debouncers[device.ieeeAddr].payload = {};
                }, time * 1000),
            };
        }
        if (this.isPayloadConflicted(payload, this.debouncers[device.ieeeAddr].payload, debounceIgnore)) {
            // publish previous payload immediately
            this.debouncers[device.ieeeAddr].publish.flush();
        }
        // extend debounced payload with current
        this.debouncers[device.ieeeAddr].payload = { ...this.debouncers[device.ieeeAddr].payload, ...payload };
        // Update state cache right away. This makes sure that during debouncing cached state is always up to date.
        // ( Update right away as "lastSeenChanged" event might occur while debouncer is still active.
        //  And if that happens it would cause old message to be published from cache.
        // By updating cache we make sure that state cache is always up-to-date.
        this.state.set(device, this.debouncers[device.ieeeAddr].payload);
        this.debouncers[device.ieeeAddr].publish();
    }
    // if debounce_ignore are specified (Array of strings)
    // then all newPayload values with key present in debounce_ignore
    // should equal or be undefined in oldPayload
    // otherwise payload is conflicted
    isPayloadConflicted(newPayload, oldPayload, debounceIgnore) {
        let result = false;
        Object.keys(oldPayload)
            .filter((key) => (debounceIgnore || []).includes(key))
            .forEach((key) => {
            if (typeof newPayload[key] !== 'undefined' && newPayload[key] !== oldPayload[key]) {
                result = true;
            }
        });
        return result;
    }
    shouldProcess(data) {
        if (!data.device.definition || data.device.zh.interviewing) {
            logger_1.default.debug(`Skipping message, still interviewing`);
            return false;
        }
        return true;
    }
    async onDeviceMessage(data) {
        /* istanbul ignore next */
        if (!data.device)
            return;
        if (!this.shouldProcess(data)) {
            await utils_1.default.publishLastSeen({ device: data.device, reason: 'messageEmitted' }, settings.get(), true, this.publishEntityState);
            return;
        }
        const converters = data.device.definition.fromZigbee.filter((c) => {
            const type = Array.isArray(c.type) ? c.type.includes(data.type) : c.type === data.type;
            return c.cluster === data.cluster && type;
        });
        // Check if there is an available converter, genOta messages are not interesting.
        const ignoreClusters = ['genOta', 'genTime', 'genBasic', 'genPollCtrl'];
        if (converters.length == 0 && !ignoreClusters.includes(data.cluster)) {
            logger_1.default.debug(`No converter available for '${data.device.definition.model}' with ` +
                `cluster '${data.cluster}' and type '${data.type}' and data '${(0, json_stable_stringify_without_jsonify_1.default)(data.data)}'`);
            await utils_1.default.publishLastSeen({ device: data.device, reason: 'messageEmitted' }, settings.get(), true, this.publishEntityState);
            return;
        }
        // Convert this Zigbee message to a MQTT message.
        // Get payload for the message.
        // - If a payload is returned publish it to the MQTT broker
        // - If NO payload is returned do nothing. This is for non-standard behaviour
        //   for e.g. click switches where we need to count number of clicks and detect long presses.
        const publish = async (payload) => {
            const options = data.device.options;
            zhc.postProcessConvertedFromZigbeeMessage(data.device.definition, payload, options);
            if (settings.get().advanced.elapsed) {
                const now = Date.now();
                if (this.elapsed[data.device.ieeeAddr]) {
                    payload.elapsed = now - this.elapsed[data.device.ieeeAddr];
                }
                this.elapsed[data.device.ieeeAddr] = now;
            }
            // Check if we have to debounce
            if (data.device.options.debounce) {
                this.publishDebounce(data.device, payload, data.device.options.debounce, data.device.options.debounce_ignore);
            }
            else {
                await this.publishEntityState(data.device, payload);
            }
        };
        const deviceExposesChanged = () => {
            this.eventBus.emitDevicesChanged();
            this.eventBus.emitExposesChanged({ device: data.device });
        };
        const meta = { device: data.device.zh, logger: logger_1.default, state: this.state.get(data.device), deviceExposesChanged: deviceExposesChanged };
        let payload = {};
        for (const converter of converters) {
            try {
                const convertData = { ...data, device: data.device.zh };
                const options = data.device.options;
                const converted = await converter.convert(data.device.definition, convertData, publish, options, meta);
                if (converted) {
                    payload = { ...payload, ...converted };
                }
            }
            catch (error) /* istanbul ignore next */ {
                logger_1.default.error(`Exception while calling fromZigbee converter: ${error.message}}`);
                logger_1.default.debug(error.stack);
            }
        }
        if (!utils_1.default.objectIsEmpty(payload)) {
            await publish(payload);
        }
        else {
            await utils_1.default.publishLastSeen({ device: data.device, reason: 'messageEmitted' }, settings.get(), true, this.publishEntityState);
        }
    }
}
exports.default = Receive;
__decorate([
    bind_decorator_1.default
], Receive.prototype, "onPublishEntityState", null);
__decorate([
    bind_decorator_1.default
], Receive.prototype, "onDeviceMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVjZWl2ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vcmVjZWl2ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsb0VBQWtDO0FBQ2xDLHdEQUFnQztBQUNoQyxrSEFBOEQ7QUFDOUQsZ0VBQWtEO0FBRWxELDREQUFvQztBQUNwQywyREFBNkM7QUFDN0MsMERBQWtDO0FBQ2xDLDREQUFvQztBQUlwQyxNQUFxQixPQUFRLFNBQVEsbUJBQVM7SUFDbEMsT0FBTyxHQUEwQixFQUFFLENBQUM7SUFDcEMsVUFBVSxHQUFrRSxFQUFFLENBQUM7SUFFdkYsS0FBSyxDQUFDLEtBQUs7UUFDUCxJQUFJLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUNwRSxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFVyxBQUFOLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxJQUFrQztRQUMvRDs7OztXQUlHO1FBQ0gsSUFDSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRTtZQUN0QixJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO1lBQ3JDLElBQUksQ0FBQyxpQkFBaUIsS0FBSyxpQkFBaUI7WUFDNUMsSUFBSSxDQUFDLGlCQUFpQixLQUFLLGlCQUFpQixFQUM5QyxDQUFDO1lBQ0MsS0FBSyxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUMxQyxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxD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