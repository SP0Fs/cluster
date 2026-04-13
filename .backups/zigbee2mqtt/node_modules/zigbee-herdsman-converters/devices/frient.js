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
const fromZigbee_1 = __importDefault(require("../converters/fromZigbee"));
const exposes = __importStar(require("../lib/exposes"));
const modernExtend_1 = require("../lib/modernExtend");
const reporting = __importStar(require("../lib/reporting"));
const e = exposes.presets;
const definitions = [
    {
        zigbeeModel: ['EMIZB-141'],
        model: 'EMIZB-141',
        vendor: 'frient',
        description: 'Smart powermeter Zigbee bridge',
        fromZigbee: [fromZigbee_1.default.metering, fromZigbee_1.default.battery],
        toZigbee: [],
        extend: [(0, modernExtend_1.ota)()],
        exposes: [e.battery(), e.power(), e.energy()],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(2);
            await reporting.bind(endpoint, coordinatorEndpoint, ['seMetering', 'genPowerCfg']);
        },
    },
    {
        zigbeeModel: ['SMRZB-153'],
        model: 'SMRZB-153',
        vendor: 'Frient A/S',
        description: 'Smart Cable - Power switch with power measurement',
        extend: [(0, modernExtend_1.onOff)({ configureReporting: false }), (0, modernExtend_1.electricityMeter)()],
        endpoint: (device) => {
            return { default: 2 };
        },
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=frient.js.map