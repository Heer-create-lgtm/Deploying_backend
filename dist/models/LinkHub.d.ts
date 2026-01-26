import mongoose, { Document } from 'mongoose';
/**
 * Generate a cryptographically random Base62 short code
 * 6 chars = 62^6 = ~56 billion combinations
 */
export declare function generateShortCode(): string;
/**
 * Generate unique short code with retry logic
 */
export declare function generateUniqueShortCode(maxRetries?: number): Promise<string>;
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
    short_code: string;
    created_at: Date;
    updated_at: Date;
}
export declare const LinkHub: mongoose.Model<ILinkHub, {}, {}, {}, mongoose.Document<unknown, {}, ILinkHub, {}, {}> & ILinkHub & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export declare function migrateShortCodes(): Promise<number>;
//# sourceMappingURL=LinkHub.d.ts.map