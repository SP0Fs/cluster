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
const reporting = __importStar(require("../lib/reporting"));
const e = exposes.presets;
const definitions = [
    {
        zigbeeModel: ['SPM01X001'],
        model: 'SPM01-U01',
        vendor: 'BITUO TECHNIK',
        description: 'Smart energy sensor',
        fromZigbee: [fromZigbee_1.default.electrical_measurement, fromZigbee_1.default.metering],
        toZigbee: [],
        exposes: [
            e.ac_frequency(),
            e.power(),
            e.power_reactive(),
            e.power_apparent(),
            e.current(),
            e.voltage(),
            e.power_factor(),
            e.energy(),
            e.produced_energy(),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ['haElectricalMeasurement', 'seMetering']);
            await reporting.readMeteringMultiplierDivisor(endpoint);
            // {change: 0} Ensure that energy and produced energy report parameters correctly during initialization instead of showing null
            await reporting.currentSummDelivered(endpoint, { change: 0 });
            await reporting.currentSummReceived(endpoint, { change: 0 });
            await endpoint.saveClusterAttributeKeyValue('haElectricalMeasurement', {
                acPowerMultiplier: 1,
                acPowerDivisor: 1,
            });
        },
    },
    {
        zigbeeModel: ['SPM02X001'],
        model: 'SPM02-U01',
        vendor: 'BITUO TECHNIK',
        description: 'Smart energy sensor',
        fromZigbee: [fromZigbee_1.default.electrical_measurement, fromZigbee_1.default.metering],
        toZigbee: [],
        exposes: [
            e.ac_frequency(),
            e.energy(),
            e.produced_energy(),
            e.power(),
            e.power_phase_b(),
            e.power_phase_c(),
            e.power_reactive(),
            e.power_reactive_phase_b(),
            e.power_reactive_phase_c(),
            e.power_apparent(),
            e.power_apparent_phase_b(),
            e.power_apparent_phase_c(),
            e.current(),
            e.current_phase_b(),
            e.current_phase_c(),
            e.voltage(),
            e.voltage_phase_b(),
            e.voltage_phase_c(),
            e.power_factor(),
            e.power_factor_phase_b(),
            e.power_factor_phase_c(),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ['haElectricalMeasurement', 'seMetering']);
            await reporting.readMeteringMultiplierDivisor(endpoint);
            // {change: 0} Ensure that energy and produced energy report parameters correctly during initialization instead of showing null
            await reporting.currentSummDelivered(endpoint, { change: 0 });
            await reporting.currentSummReceived(endpoint, { change: 0 });
            await endpoint.saveClusterAttributeKeyValue('haElectricalMeasurement', {
                acPowerMultiplier: 1,
                acPowerDivisor: 1,
            });
        },
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=bituo_technik.js.map