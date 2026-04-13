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
const fs_1 = __importDefault(require("fs"));
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
const data_1 = __importDefault(require("./util/data"));
const logger_1 = __importDefault(require("./util/logger"));
const settings = __importStar(require("./util/settings"));
const utils_1 = __importDefault(require("./util/utils"));
const saveInterval = 1000 * 60 * 5; // 5 minutes
const dontCacheProperties = [
    'action',
    'action_.*',
    'button',
    'button_left',
    'button_right',
    'click',
    'forgotten',
    'keyerror',
    'step_size',
    'transition_time',
    'group_list',
    'group_capacity',
    'no_occupancy_since',
    'step_mode',
    'transition_time',
    'duration',
    'elapsed',
    'from_side',
    'to_side',
];
class State {
    eventBus;
    zigbee;
    state = {};
    file = data_1.default.joinPath('state.json');
    timer = null;
    constructor(eventBus, zigbee) {
        this.eventBus = eventBus;
        this.zigbee = zigbee;
        this.eventBus = eventBus;
        this.zigbee = zigbee;
    }
    start() {
        this.load();
        // Save the state on every interval
        this.timer = setInterval(() => this.save(), saveInterval);
    }
    stop() {
        // Remove any invalid states (ie when the device has left the network) when the system is stopped
        Object.keys(this.state)
            .filter((k) => typeof k === 'string' && !this.zigbee.resolveEntity(k)) // string key = ieeeAddr
            .forEach((k) => delete this.state[k]);
        clearTimeout(this.timer);
        this.save();
    }
    load() {
        if (fs_1.default.existsSync(this.file)) {
            try {
                this.state = JSON.parse(fs_1.default.readFileSync(this.file, 'utf8'));
                logger_1.default.debug(`Loaded state from file ${this.file}`);
            }
            catch (error) {
                logger_1.default.debug(`Failed to load state from file ${this.file} (corrupt file?) (${error.message})`);
            }
        }
        else {
            logger_1.default.debug(`Can't load state from file ${this.file} (doesn't exist)`);
        }
    }
    save() {
        if (settings.get().advanced.cache_state_persistent) {
            logger_1.default.debug(`Saving state to file ${this.file}`);
            const json = JSON.stringify(this.state, null, 4);
            try {
                fs_1.default.writeFileSync(this.file, json, 'utf8');
            }
            catch (e) {
                logger_1.default.error(`Failed to write state to '${this.file}' (${e.message})`);
            }
        }
        else {
            logger_1.default.debug(`Not saving state`);
        }
    }
    exists(entity) {
        return this.state.hasOwnProperty(entity.ID);
    }
    get(entity) {
        return this.state[entity.ID] || {};
    }
    set(entity, update, reason = null) {
        const fromState = this.state[entity.ID] || {};
        const toState = (0, object_assign_deep_1.default)({}, fromState, update);
        const newCache = { ...toState };
        const entityDontCacheProperties = entity.options.filtered_cache || [];
        utils_1.default.filterProperties(dontCacheProperties.concat(entityDontCacheProperties), newCache);
        this.state[entity.ID] = newCache;
        this.eventBus.emitStateChange({ entity, from: fromState, to: toState, reason, update });
        return toState;
    }
    remove(ID) {
        delete this.state[ID];
    }
}
exports.default = State;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9saWIvc3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDRDQUFvQjtBQUNwQiw0RUFBa0Q7QUFFbEQsdURBQStCO0FBQy9CLDJEQUFtQztBQUNuQywwREFBNEM7QUFDNUMseURBQWlDO0FBRWpDLE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsWUFBWTtBQUVoRCxNQUFNLG1CQUFtQixHQUFHO0lBQ3hCLFFBQVE7SUFDUixXQUFXO0lBQ1gsUUFBUTtJQUNSLGFBQWE7SUFDYixjQUFjO0lBQ2QsT0FBTztJQUNQLFdBQVc7SUFDWCxVQUFVO0lBQ1YsV0FBVztJQUNYLGlCQUFpQjtJQUNqQixZQUFZO0lBQ1osZ0JBQWdCO0lBQ2hCLG9CQUFvQjtJQUNwQixXQUFXO0lBQ1gsaUJBQWlCO0lBQ2pCLFVBQVU7SUFDVixTQUFTO0lBQ1QsV0FBVztJQUNYLFNBQVM7Q0FDWixDQUFDO0FBRUYsTUFBTSxLQUFLO0lBTWM7SUFDQTtJQU5iLEtBQUssR0FBcUMsRUFBRSxDQUFDO0lBQzdDLElBQUksR0FBRyxjQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ25DLEtBQUssR0FBbUIsSUFBSSxDQUFDO0lBRXJDLFlBQ3FCLFFBQWtCLEVBQ2xCLE1BQWM7UUFEZCxhQUFRLEdBQVIsUUFBUSxDQUFVO1FBQ2xCLFdBQU0sR0FBTixNQUFNLENBQVE7UUFFL0IsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7SUFDekIsQ0FBQztJQUVELEtBQUs7UUFDRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFWixtQ0FBbUM7UUFDbkMsSUFBSSxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUMsSUFB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