import mongoose, { Document } from 'mongoose';
export type UserRole = 'user' | 'admin';
export interface IUser extends Document {
    user_id: string;
    email: string;
    password_hash: string;
    role: UserRole;
    name?: string;
    created_at: Date;
    updated_at: Date;
    comparePassword(password: string): Promise<boolean>;
}
export declare const User: mongoose.Model<IUser, {}, {}, {}, mongoose.Document<unknown, {}, IUser, {}, {}> & IUser & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
/**
 * Hash a password
 */
export declare const hashPassword: (password: string) => Promise<string>;
//# sourceMappingURL=User.d.ts.map