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
const iconv = __importStar(require("iconv-lite"));
const exposes = __importStar(require("../lib/exposes"));
const logger_1 = require("../lib/logger");
const NS = 'zhc:easyiot';
const ea = exposes.access;
const e = exposes.presets;
const fzLocal = {
    easyiot_ir_recv_command: {
        cluster: 'tunneling',
        type: ['commandTransferDataResp'],
        convert: (model, msg, publish, options, meta) => {
            logger_1.logger.debug(`"easyiot_ir_recv_command" received (msg:${JSON.stringify(msg.data)})`, NS);
            const hexString = msg.data.data.toString('hex');
            logger_1.logger.debug(`"easyiot_ir_recv_command" received command ${hexString}`, NS);
            return { last_received_command: hexString };
        },
    },
    easyiot_tts_recv_status: {
        cluster: 'tunneling',
        type: ['commandTransferDataResp'],
        convert: (model, msg, publish, options, meta) => {
            logger_1.logger.debug(`"easyiot_tts_recv_status" received (msg:${JSON.stringify(msg.data)})`, NS);
            const hexString = msg.data.data.toString('hex');
            logger_1.logger.debug(`"easyiot_tts_recv_status" received status ${hexString}`, NS);
            return { last_received_status: hexString };
        },
    },
};
const tzLocal = {
    easyiot_ir_send_command: {
        key: ['send_command'],
        convertSet: async (entity, key, value, meta) => {
            if (!value) {
                throw new Error(`There is no IR code to send`);
            }
            logger_1.logger.debug(`Sending IR code: ${value}`, NS);
            await entity.command('tunneling', 'transferData', {
                tunnelID: 0x0000,
                data: Buffer.from(value, 'hex'),
            }, { disableDefaultResponse: true });
            logger_1.logger.debug(`Sending IR command success.`, NS);
        },
    },
    easyiot_tts_send_command: {
        key: ['send_tts'],
        convertSet: async (entity, key, value, meta) => {
            if (!value) {
                throw new Error(`There is no text to send`);
            }
            logger_1.logger.debug(`Sending IR code: ${value}`, NS);
            const frameHeader = Buffer.from([0xfd]);
            const gb2312Buffer = iconv.encode(value, 'GB2312');
            const dataLength = gb2312Buffer.length + 2;
            const dataLengthBuffer = Buffer.alloc(2);
            dataLengthBuffer.writeUInt16BE(dataLength, 0);
            const commandByte = Buffer.from([0x01, 0x01]);
            const protocolFrame = Buffer.concat([frameHeader, dataLengthBuffer, commandByte, gb2312Buffer]);
            await entity.command('tunneling', 'transferData', {
                tunnelID: 0x0000,
                data: protocolFrame,
            }, { disableDefaultResponse: true });
            logger_1.logger.debug(`Sending IR command success.`, NS);
        },
    },
};
const definitions = [
    {
        fingerprint: [{ modelID: 'ZB-IR01', manufacturerName: 'easyiot' }],
        model: 'ZB-IR01',
        vendor: 'easyiot',
        description: 'This is an infrared remote control equipped with a local code library,' +
            'supporting devices such as air conditioners, televisions, projectors, and more.',
        fromZigbee: [fzLocal.easyiot_ir_recv_command],
        toZigbee: [tzLocal.easyiot_ir_send_command],
        exposes: [
            e.text('last_received_command', ea.STATE).withDescription('Received infrared control command'),
            e.text('send_command', ea.SET).withDescription('Send infrared control command'),
        ],
    },
    {
        fingerprint: [{ modelID: 'ZB-TTS01', manufacturerName: 'easyiot' }],
        model: 'ZB-TTS01',
        vendor: 'easyiot',
        description: 'This is a Simplified Chinese (GB2312) TTS converter that can convert GB2312 encoded text to speech',
        fromZigbee: [fzLocal.easyiot_tts_recv_status],
        toZigbee: [tzLocal.easyiot_tts_send_command],
        exposes: [
            e.text('last_received_status', ea.STATE).withDescription('status'),
            e.text('send_tts', ea.SET).withDescription('Please enter text'),
        ],
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=easyiot.js.map