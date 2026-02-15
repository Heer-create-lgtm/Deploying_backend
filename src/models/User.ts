import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'user' | 'admin';

export interface IUser extends Document {
    user_id: string;
    email: string;
    password_hash: string;
    role: UserRole;
    name?: string;
    created_at: Date;
    updated_at: Date;

    // Instance methods
    comparePassword(password: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>({
    user_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    password_hash: {
        type: String,
        required: true,
        select: false  // Don't include by default in queries
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    name: {
        type: String,
        trim: true
    },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Instance method to compare passwords
UserSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password_hash);
};

// Static method to hash password
UserSchema.statics.hashPassword = async (password: string): Promise<string> => {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
};

// Index for role-based queries
UserSchema.index({ role: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);

/**
 * Hash a password
 */
export const hashPassword = async (password: string): Promise<string> => {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
};
