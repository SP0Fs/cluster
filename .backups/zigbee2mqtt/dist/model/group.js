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
const settings = __importStar(require("../util/settings"));
class Group {
    zh;
    resolveDevice;
    get ID() {
        return this.zh.groupID;
    }
    get options() {
        return { ...settings.getGroup(this.ID) };
    }
    get name() {
        return this.options?.friendly_name || this.ID.toString();
    }
    constructor(group, resolveDevice) {
        this.zh = group;
        this.resolveDevice = resolveDevice;
    }
    hasMember(device) {
        return !!device.zh.endpoints.find((e) => this.zh.members.includes(e));
    }
    membersDevices() {
        return this.zh.members.map((e) => this.resolveDevice(e.getDevice().ieeeAddr)).filter((d) => d);
    }
    membersDefinitions() {
        return this.membersDevices()
            .map((d) => d.definition)
            .filter((d) => d);
    }
    isDevice() {
        return false;
    }
    isGroup() {
        return true;
    }
}
exports.default = Group;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvbW9kZWwvZ3JvdXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUdBLDJEQUE2QztBQUU3QyxNQUFxQixLQUFLO0lBQ2YsRUFBRSxDQUFXO0lBQ1osYUFBYSxDQUErQjtJQUVwRCxJQUFJLEVBQUU7UUFDRixPQUFPLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDO0lBQzNCLENBQUM7SUFDRCxJQUFJLE9BQU87UUFDUCxPQUFPLEVBQUMsR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBQyxDQUFDO0lBQzNDLENBQUM7SUFDRCxJQUFJLElBQUk7UUFDSixPQUFPLElBQUksQ0FBQyxPQUFPLEVBQUUsYUFBYSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDN0QsQ0FBQztJQUVELFlBQVksS0FBZSxFQUFFLGFBQTJDO1FBQ3BFLElBQUksQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBQ2hCLElBQUksQ0FBQyxhQUFhLEdBQUcsYUFBYSxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxTQUFTLENBQUMsTUFBYztRQUNwQixPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFFLENBQUM7SUFFRCxjQUFjO1FBQ1YsT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuRyxDQUFDO0lBRUQsa0JBQWtCO1FBQ2QsT0FBTyxJQUFJLENBQUMsY0FBYyxFQUFFO2FBQ3ZCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQzthQUN4QixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFCLENBQUM7SUFFRCxRQUFRO1FBQ0osT0FBTyxLQUFLLENBQUM7SUFDakIsQ0FBQztJQUNELE9BQU87UUFDSCxPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0NBQ0o7QUF2Q0Qsd0JBdUNDIn0=