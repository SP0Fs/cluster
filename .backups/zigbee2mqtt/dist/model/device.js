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
Object.defineProperty(exports, "__esModule", { value: true });
const zhc = __importStar(require("zigbee-herdsman-converters"));
const settings = __importStar(require("../util/settings"));
class Device {
    zh;
    definition;
    _definitionModelID;
    get ieeeAddr() {
        return this.zh.ieeeAddr;
    }
    get ID() {
        return this.zh.ieeeAddr;
    }
    get options() {
        return { ...settings.get().device_options, ...settings.getDevice(this.ieeeAddr) };
    }
    get name() {
        return this.zh.type === 'Coordinator' ? 'Coordinator' : this.options?.friendly_name || this.ieeeAddr;
    }
    get isSupported() {
        return this.zh.type === 'Coordinator' || (this.definition && !this.definition.generated);
    }
    get customClusters() {
        return this.zh.customClusters;
    }
    constructor(device) {
        this.zh = device;
    }
    exposes() {
        /* istanbul ignore if */
        if (typeof this.definition.exposes == 'function') {
            const options = this.options;
            return this.definition.exposes(this.zh, options);
        }
        else {
            return this.definition.exposes;
        }
    }
    async resolveDefinition(ignoreCache = false) {
        if (!this.zh.interviewing && (!this.definition || this._definitionModelID !== this.zh.modelID || ignoreCache)) {
            this.definition = await zhc.findByDevice(this.zh, true);
            this._definitionModelID = this.zh.modelID;
        }
    }
    ensureInSettings() {
        if (this.zh.type !== 'Coordinator' && !settings.getDevice(this.zh.ieeeAddr)) {
            settings.addDevice(this.zh.ieeeAddr);
        }
    }
    endpoint(key) {
        let endpoint;
        if (key == null || key == '')
            key = 'default';
        if (!isNaN(Number(key))) {
            endpoint = this.zh.getEndpoint(Number(key));
        }
        else if (this.definition?.endpoint) {
            const ID = this.definition?.endpoint?.(this.zh)[key];
            if (ID)
                endpoint = this.zh.getEndpoint(ID);
            else if (key === 'default')
                endpoint = this.zh.endpoints[0];
            else
                return null;
        }
        else {
            /* istanbul ignore next */
            if (key !== 'default')
                return null;
            endpoint = this.zh.endpoints[0];
        }
        return endpoint;
    }
    endpointName(endpoint) {
        let epName = null;
        if (this.definition?.endpoint) {
            const mapping = this.definition?.endpoint(this.zh);
            for (const [name, id] of Object.entries(mapping)) {
                if (id == endpoint.ID) {
                    epName = name;
                }
            }
        }
        /* istanbul ignore next */
        return epName === 'default' ? null : epName;
    }
    getEndpointNames() {
        return Object.keys(this.definition?.endpoint?.(this.zh) ?? {}).filter((name) => name !== 'default');
    }
    isIkeaTradfri() {
        return this.zh.manufacturerID === 4476;
    }
    isDevice() {
        return true;
    }
    /* istanbul ignore next */
    isGroup() {
        return false;
    }
}
exports.default = Device;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL21vZGVsL2RldmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsZ0VBQWtEO0FBRWxELDJEQUE2QztBQUU3QyxNQUFxQixNQUFNO0lBQ2hCLEVBQUUsQ0FBWTtJQUNkLFVBQVUsQ0FBaUI7SUFDMUIsa0JBQWtCLENBQVM7SUFFbkMsSUFBSSxRQUFRO1FBQ1IsT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQztJQUM1QixDQUFDO0lBQ0QsSUFBSSxFQUFFO1FBQ0YsT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQztJQUM1QixDQUFDO0lBQ0QsSUFBSSxPQUFPO1FBQ1AsT0FBTyxFQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLGNBQWMsRUFBRSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFDLENBQUM7SUFDcEYsQ0FBQztJQUNELElBQUksSUFBSTtRQUNKLE9BQU8sSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssYUFBYSxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsYUFBYSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDekcsQ0FBQztJQUNELElBQUksV0FBVztRQUNYLE9BQU8sSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssYUFBYSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDN0YsQ0FBQztJQUNELElBQUksY0FBYztRQUNkLE9BQU8sSUFBSSxDQUFDLEVBQUUsQ0FBQyxjQUFjLENBQUM7SUFDbEMsQ0FBQztJQUVELFlBQVksTUFBaUI7UUFDekIsSUFBSSxDQUFDLEVBQUUsR0FB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