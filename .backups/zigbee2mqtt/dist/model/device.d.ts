import { CustomClusters } from 'zigbee-herdsman/dist/zspec/zcl/definition/tstype';
import * as zhc from 'zigbee-herdsman-converters';
export default class Device {
    zh: zh.Device;
    definition: zhc.Definition;
    private _definitionModelID;
    get ieeeAddr(): string;
    get ID(): string;
    get options(): DeviceOptions;
    get name(): string;
    get isSupported(): boolean;
    get customClusters(): CustomClusters;
    constructor(device: zh.Device);
    exposes(): zhc.Expose[];
    resolveDefinition(ignoreCache?: boolean): Promise<void>;
    ensureInSettings(): void;
    endpoint(key?: string | number): zh.Endpoint;
    endpointName(endpoint: zh.Endpoint): string;
    getEndpointNames(): string[];
    isIkeaTradfri(): boolean;
    isDevice(): this is Device;
    isGroup(): this is Group;
}
//# sourceMappingURL=device.d.ts.map