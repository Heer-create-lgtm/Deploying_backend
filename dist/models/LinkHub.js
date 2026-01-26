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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkHub = void 0;
exports.generateShortCode = generateShortCode;
exports.generateUniqueShortCode = generateUniqueShortCode;
exports.migrateShortCodes = migrateShortCodes;
const mongoose_1 = __importStar(require("mongoose"));
// ==================== Base62 Short Code Generator ====================
// Generates truly short 6-character codes using Base62 encoding
// Format: /r/Ab3Kx9 (only 6 chars!)
const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SHORT_CODE_LENGTH = 6;
/**
 * Generate a cryptographically random Base62 short code
 * 6 chars = 62^6 = ~56 billion combinations
 */
function generateShortCode() {
    let code = '';
    const randomBytes = new Uint8Array(SHORT_CODE_LENGTH);
    // Use crypto.getRandomValues for better randomness if available
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(randomBytes);
    }
    else {
        // Fallback to Math.random
        for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
            randomBytes[i] = Math.floor(Math.random() * 256);
        }
    }
    for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
        code += BASE62_CHARS[randomBytes[i] % 62];
    }
    return code;
}
/**
 * Generate unique short code with retry logic
 */
async function generateUniqueShortCode(maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        const code = generateShortCode();
        const exists = await exports.LinkHub.findOne({ short_code: code });
        if (!exists)
            return code;
    }
    // Fallback: append timestamp suffix for guaranteed uniqueness
    return generateShortCode() + Date.now().toString(36).slice(-2);
}
const ThemeSchema = new mongoose_1.Schema({
    bg: { type: String, required: true },
    accent: { type: String, required: true },
}, { _id: false });
const LinkHubSchema = new mongoose_1.Schema({
    hub_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    username: { type: String },
    avatar: { type: String },
    bio: { type: String },
    default_url: {
        type: String,
        required: true
    },
    theme: {
        type: ThemeSchema,
        required: true
    },
    rule_tree_id: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'RuleTree'
    },
    owner_user_id: {
        type: String,
        index: true
    },
    short_code: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
        default: generateShortCode // Generate 6-char Base62 short code
    },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
// Pre-save hook: Ensure short_code is always present
LinkHubSchema.pre('save', function (next) {
    if (!this.short_code) {
        this.short_code = generateShortCode();
    }
    next();
});
// Compound index for owner queries
LinkHubSchema.index({ owner_user_id: 1, created_at: -1 });
exports.LinkHub = mongoose_1.default.model('LinkHub', LinkHubSchema);
// Migration function to add short_code to existing hubs
async function migrateShortCodes() {
    const hubsWithoutShortCode = await exports.LinkHub.find({
        $or: [
            { short_code: { $exists: false } },
            { short_code: null },
            { short_code: '' }
        ]
    });
    let migrated = 0;
    for (const hub of hubsWithoutShortCode) {
        hub.short_code = generateShortCode();
        await hub.save();
        migrated++;
    }
    return migrated;
}
//# sourceMappingURL=LinkHub.js.map