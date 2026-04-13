"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const modernExtend_1 = require("../lib/modernExtend");
const definitions = [
    {
        zigbeeModel: ['1719SP-PS1-02'],
        model: 'SP-PS1-02',
        vendor: 'Spotmau',
        description: 'Smart wall switch - 1 gang',
        extend: [(0, modernExtend_1.onOff)()],
        endpoint: (device) => {
            return { default: 16 };
        },
    },
    {
        zigbeeModel: ['1719SP-PS2-02'],
        model: 'SP-PS2-02',
        vendor: 'Spotmau',
        description: 'Smart wall switch - 2 gang',
        extend: [(0, modernExtend_1.deviceEndpoints)({ endpoints: { left: 16, right: 17 } }), (0, modernExtend_1.onOff)({ endpointNames: ['left', 'right'] })],
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=spotmau.js.map