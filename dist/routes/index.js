"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportRoutes = exports.shorturlRoutes = exports.analyticsRoutes = exports.authRoutes = exports.adminRoutes = exports.redirectRoutes = void 0;
var redirect_1 = require("./redirect");
Object.defineProperty(exports, "redirectRoutes", { enumerable: true, get: function () { return __importDefault(redirect_1).default; } });
var admin_1 = require("./admin");
Object.defineProperty(exports, "adminRoutes", { enumerable: true, get: function () { return __importDefault(admin_1).default; } });
var auth_1 = require("./auth");
Object.defineProperty(exports, "authRoutes", { enumerable: true, get: function () { return __importDefault(auth_1).default; } });
var analytics_1 = require("./analytics");
Object.defineProperty(exports, "analyticsRoutes", { enumerable: true, get: function () { return __importDefault(analytics_1).default; } });
var shorturl_1 = require("./shorturl");
Object.defineProperty(exports, "shorturlRoutes", { enumerable: true, get: function () { return __importDefault(shorturl_1).default; } });
var export_1 = require("./export");
Object.defineProperty(exports, "exportRoutes", { enumerable: true, get: function () { return __importDefault(export_1).default; } });
//# sourceMappingURL=index.js.map