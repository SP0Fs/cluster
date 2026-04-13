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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const fs_1 = __importDefault(require("fs"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const path_1 = __importDefault(require("path"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const data_1 = __importDefault(require("./../util/data"));
const logger_1 = __importDefault(require("./../util/logger"));
const extension_1 = __importDefault(require("./extension"));
const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/extension/(save|remove)`);
class ExternalExtension extends extension_1.default {
    requestLookup;
    async start() {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.requestLookup = { save: this.saveExtension, remove: this.removeExtension };
        await this.loadUserDefinedExtensions();
        await this.publishExtensions();
    }
    getExtensionsBasePath() {
        return data_1.default.joinPath('extension');
    }
    getListOfUserDefinedExtensions() {
        const basePath = this.getExtensionsBasePath();
        if (fs_1.default.existsSync(basePath)) {
            return fs_1.default
                .readdirSync(basePath)
                .filter((f) => f.endsWith('.js'))
                .map((fileName) => {
                const extensionFilePath = path_1.default.join(basePath, fileName);
                return { name: fileName, code: fs_1.default.readFileSync(extensionFilePath, 'utf-8') };
            });
        }
        else {
            return [];
        }
    }
    async removeExtension(message) {
        const { name } = message;
        const extensions = this.getListOfUserDefinedExtensions();
        const extensionToBeRemoved = extensions.find((e) => e.name === name);
        if (extensionToBeRemoved) {
            await this.enableDisableExtension(false, extensionToBeRemoved.name);
            const basePath = this.getExtensionsBasePath();
            const extensionFilePath = path_1.default.join(basePath, path_1.default.basename(name));
            fs_1.default.unlinkSync(extensionFilePath);
            await this.publishExtensions();
            logger_1.default.info(`Extension ${name} removed`);
            return utils_1.default.getResponse(message, {}, null);
        }
        else {
            return utils_1.default.getResponse(message, {}, `Extension ${name} doesn't exists`);
        }
    }
    async saveExtension(message) {
        const { name, code } = message;
        const ModuleConstructor = utils_1.default.loadModuleFromText(code, name);
        await this.loadExtension(ModuleConstructor);
        const basePath = this.getExtensionsBasePath();
        /* istanbul ignore else */
        if (!fs_1.default.existsSync(basePath)) {
            fs_1.default.mkdirSync(basePath);
        }
        const extensionFilePath = path_1.default.join(basePath, path_1.default.basename(name));
        fs_1.default.writeFileSync(extensionFilePath, code);
        await this.publishExtensions();
        logger_1.default.info(`Extension ${name} loaded`);
        return utils_1.default.getResponse(message, {}, null);
    }
    async onMQTTMessage(data) {
        const match = data.topic.match(requestRegex);
        if (match && this.requestLookup[match[1].toLowerCase()]) {
            const message = utils_1.default.parseJSON(data.message, data.message);
            try {
                const response = await this.requestLookup[match[1].toLowerCase()](message);
                await this.mqtt.publish(`bridge/response/extension/${match[1]}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
            }
            catch (error) {
                logger_1.default.error(`Request '${data.topic}' failed with error: '${error.message}'`);
                const response = utils_1.default.getResponse(message, {}, error.message);
                await this.mqtt.publish(`bridge/response/extension/${match[1]}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
            }
        }
    }
    async loadExtension(ConstructorClass) {
        await this.enableDisableExtension(false, ConstructorClass.name);
        // @ts-ignore
        await this.addExtension(new ConstructorClass(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus, settings, logger_1.default));
    }
    async loadUserDefinedExtensions() {
        for (const extension of this.getListOfUserDefinedExtensions()) {
            await this.loadExtension(utils_1.default.loadModuleFromText(extension.code, extension.name));
        }
    }
    async publishExtensions() {
        const extensions = this.getListOfUserDefinedExtensions();
        await this.mqtt.publish('bridge/extensions', (0, json_stable_stringify_without_jsonify_1.default)(extensions), {
            retain: true,
            qos: 0,
        }, settings.get().mqtt.base_topic, true);
    }
}
exports.default = ExternalExtension;
__decorate([
    bind_decorator_1.default
], ExternalExtension.prototype, "removeExtension", null);
__decorate([
    bind_decorator_1.default
], ExternalExtension.prototype, "saveExtension", null);
__decorate([
    bind_decorator_1.default
], ExternalExtension.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], ExternalExtension.prototype, "loadExtension", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxFeHRlbnNpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvZXh0ZW5zaW9uL2V4dGVybmFsRXh0ZW5zaW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxvRUFBa0M7QUFDbEMsNENBQW9CO0FBQ3BCLGtIQUE4RDtBQUM5RCxnREFBd0I7QUFFeEIsMkRBQTZDO0FBQzdDLDBEQUFrQztBQUNsQywwREFBa0M7QUFDbEMsOERBQXNDO0FBQ3RDLDREQUFvQztBQUVwQyxNQUFNLFlBQVksR0FBRyxJQUFJLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSx5Q0FBeUMsQ0FBQyxDQUFDO0FBRTVHLE1BQXFCLGlCQUFrQixTQUFRLG1CQUFTO0lBQzVDLGFBQWEsQ0FBOEQ7SUFFMUUsS0FBSyxDQUFDLEtBQUs7UUFDaEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxhQUFhLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUMsQ0FBQztRQUM5RSxNQUFNLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7SUFDbkMsQ0FBQztJQUVPLHFCQUFxQjtRQUN6QixPQUFPLGNBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVPLDhCQUE4QjtRQUNsQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUM5QyxJQUFJLFlBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUMxQixPQUFPLFlB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