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
const toZigbee_1 = __importDefault(require("../converters/toZigbee"));
const exposes = __importStar(require("../lib/exposes"));
const reporting = __importStar(require("../lib/reporting"));
const e = exposes.presets;
const definitions = [
    {
        zigbeeModel: ['Aidoo Zigbee'],
        model: 'AZAI6ZBEMHI',
        vendor: 'Airzone',
        description: 'Gateway for two-way control and integration of AirCon Units.AZAI6ZBEMHI for Mitsubishi Heavy',
        fromZigbee: [fromZigbee_1.default.thermostat, fromZigbee_1.default.on_off, fromZigbee_1.default.fan],
        toZigbee: [
            toZigbee_1.default.thermostat_local_temperature,
            toZigbee_1.default.thermostat_occupied_heating_setpoint,
            toZigbee_1.default.thermostat_occupied_cooling_setpoint,
            toZigbee_1.default.thermostat_system_mode,
            toZigbee_1.default.on_off,
            toZigbee_1.default.fan_mode,
        ],
        exposes: [
            e
                .climate()
                .withLocalTemperature()
                .withSystemMode(['off', 'auto', 'cool', 'heat', 'fan_only', 'dry'])
                .withFanMode(['off', 'low', 'medium', 'high', 'on', 'auto'])
                .withSetpoint('occupied_heating_setpoint', 5, 30, 0.5)
                .withSetpoint('occupied_cooling_setpoint', 5, 30, 0.5),
            e.switch(),
        ],
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ['hvacThermostat', 'hvacFanCtrl', 'genOnOff']);
            await reporting.thermostatTemperature(endpoint);
            await reporting.thermostatOccupiedHeatingSetpoint(endpoint);
            await reporting.onOff(endpoint);
            await reporting.fanMode(endpoint);
        },
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=airzone_aidoo.js.map