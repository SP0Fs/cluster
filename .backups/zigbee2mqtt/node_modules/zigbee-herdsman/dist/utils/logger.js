"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.setLogger = setLogger;
exports.logger = {
    debug: (message, namespace) => console.debug(`${namespace}: ${message}`),
    info: (message, namespace) => console.info(`${namespace}: ${message}`),
    warning: (message, namespace) => console.warn(`${namespace}: ${message}`),
    error: (message, namespace) => console.error(`${namespace}: ${message}`),
};
function setLogger(l) {
    exports.logger = l;
}
//# sourceMappingURL=logger.js.map