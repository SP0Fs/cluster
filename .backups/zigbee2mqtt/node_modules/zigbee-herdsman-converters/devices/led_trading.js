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
const logger_1 = require("../lib/logger");
const modernExtend_1 = require("../lib/modernExtend");
const reporting = __importStar(require("../lib/reporting"));
const utils = __importStar(require("../lib/utils"));
const NS = 'zhc:led_trading';
const e = exposes.presets;
const fzLocal = {
    led_trading_9133: {
        cluster: 'greenPower',
        type: ['commandNotification', 'commandCommissioningNotification'],
        convert: (model, msg, publish, options, meta) => {
            const commandID = msg.data.commandID;
            if (utils.hasAlreadyProcessedMessage(msg, model, msg.data.frameCounter, `${msg.device.ieeeAddr}_${commandID}`))
                return;
            if (commandID === 224)
                return;
            const lookup = {
                0x13: 'press_1',
                0x14: 'press_2',
                0x15: 'press_3',
                0x16: 'press_4',
                0x1b: 'hold_1',
                0x1c: 'hold_2',
                0x1d: 'hold_3',
                0x1e: 'hold_4',
            };
            if (!lookup.hasOwnProperty(commandID)) {
                logger_1.logger.error(`led_trading_9133: missing command '${commandID}'`, NS);
            }
            else {
                return { action: utils.getFromLookup(commandID, lookup) };
            }
        },
    },
};
const definitions = [
    {
        fingerprint: [{ modelID: 'GreenPower_2', ieeeAddr: /^0x00000000427.....$/ }],
        model: '9133',
        vendor: 'LED-Trading',
        description: 'Pushbutton transmitter module',
        fromZigbee: [fzLocal.led_trading_9133],
        toZigbee: [],
        exposes: [e.action(['press_1', 'hold_1', 'press_2', 'hold_2', 'press_3', 'hold_3', 'press_4', 'hold_4'])],
    },
    {
        zigbeeModel: ['HK-LN-DIM-A'],
        model: 'HK-LN-DIM-A',
        vendor: 'LED-Trading',
        description: 'ZigBee AC phase-cut dimmer',
        extend: [(0, modernExtend_1.light)({ configureReporting: true })],
    },
    {
        zigbeeModel: ['HK-LN-SOCKET-A'],
        model: '9134',
        vendor: 'LED-Trading',
        description: 'Powerstrip with 4 sockets and USB',
        extend: [(0, modernExtend_1.deviceEndpoints)({ endpoints: { l1: 1, l2: 2, l3: 3, l4: 4, l5: 5 } }), (0, modernExtend_1.onOff)({ endpointNames: ['l1', 'l2', 'l3', 'l4', 'l5'] })],
    },
    {
        zigbeeModel: ['HK-ZCC-ZLL-A'],
        model: '9135',
        vendor: 'LED-Trading',
        description: 'Curtain motor controller',
        meta: { coverInverted: true },
        fromZigbee: [fromZigbee_1.default.cover_position_tilt],
        toZigbee: [toZigbee_1.default.cover_state, toZigbee_1.default.cover_position_tilt],
        exposes: [e.cover_position()],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ['closuresWindowCovering']);
            await reporting.currentPositionLiftPercentage(endpoint);
        },
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=led_trading.js.map