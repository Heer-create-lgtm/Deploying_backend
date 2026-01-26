import mongoose, { Schema, Document } from 'mongoose';

// ==================== Base62 Short Code Generator ====================
// Generates truly short 6-character codes using Base62 encoding
// Format: /r/Ab3Kx9 (only 6 chars!)

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SHORT_CODE_LENGTH = 6;

/**
 * Generate a cryptographically random Base62 short code
 * 6 chars = 62^6 = ~56 billion combinations
 */
export function generateShortCode(): string {
    let code = '';
    const randomBytes = new Uint8Array(SHORT_CODE_LENGTH);

    // Use crypto.getRandomValues for better randomness if available
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(randomBytes);
    } else {
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
export async function generateUniqueShortCode(maxRetries = 5): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
        const code = generateShortCode();
        const exists = await LinkHub.findOne({ short_code: code });
        if (!exists) return code;
    }
    // Fallback: append timestamp suffix for guaranteed uniqueness
    return generateShortCode() + Date.now().toString(36).slice(-2);
}

// ==================== Schema Definitions ====================

export interface ITheme {
    bg: string;
    accent: string;
}

export interface ILinkHub extends Document {
    hub_id: string;
    slug: string;
    username?: string;
    avatar?: string;
    bio?: string;
    default_url: string;
    theme: ITheme;
    rule_tree_id?: mongoose.Types.ObjectId;
    owner_user_id?: string;
    short_code: string;  // Short URL code for /r/:code (6 chars, Base62)
    created_at: Date;
    updated_at: Date;
}

const ThemeSchema = new Schema<ITheme>({
    bg: { type: String, required: true },
    accent: { type: String, required: true },
}, { _id: false });

const LinkHubSchema = new Schema<ILinkHub>({
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
        type: Schema.Types.ObjectId,
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
        default: generateShortCode  // Generate 6-char Base62 short code
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

export const LinkHub = mongoose.model<ILinkHub>('LinkHub', LinkHubSchema);

// Migration function to add short_code to existing hubs
export async function migrateShortCodes(): Promise<number> {
    const hubsWithoutShortCode = await LinkHub.find({
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

