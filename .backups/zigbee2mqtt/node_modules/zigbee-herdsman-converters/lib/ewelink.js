"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.modernExtend = exports.ewelinkModernExtend = void 0;
const exposes_1 = require("./exposes");
const modernExtend_1 = require("./modernExtend");
exports.ewelinkModernExtend = {
    ewelinkAction: () => {
        const exposes = [exposes_1.presets.action(['single', 'double', 'long'])];
        const fromZigbee = [
            {
                cluster: 'genOnOff',
                type: ['commandOn', 'commandOff', 'commandToggle'],
                convert: (model, msg, publish, options, meta) => {
                    const lookup = { commandToggle: 'single', commandOn: 'double', commandOff: 'long' };
                    return { action: lookup[msg.type] };
                },
            },
        ];
        const configure = [(0, modernExtend_1.setupConfigureForBinding)('genOnOff', 'output')];
        return { exposes, fromZigbee, configure, isModernExtend: true };
    },
};
exports.modernExtend = exports.ewelinkModernExtend;
//# sourceMappingURL=ewelink.js.map