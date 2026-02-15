import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { User, IUser, hashPassword, UserRole } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'smart-link-hub-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * JWT Payload structure
 */
export interface IJWTPayload {
    user_id: string;
    email: string;
    role: UserRole;
}

/**
 * Auth result returned after successful login/register
 */
export interface IAuthResult {
    user: {
        user_id: string;
        email: string;
        name?: string;
        role: UserRole;
    };
    token: string;
    expires_in: string;
}

/**
 * Authentication Service
 * Handles user registration, login, and JWT token management
 */
export class AuthService {

    /**
     * Register a new user
     */
    async register(email: string, password: string, name?: string, role?: UserRole): Promise<IAuthResult> {
        // Check if email already exists
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            throw new Error('Email already registered');
        }

        // Validate password strength
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }

        // Hash password
        const password_hash = await hashPassword(password);

        // Create user
        const user = await User.create({
            user_id: uuidv4(),
            email: email.toLowerCase(),
            password_hash,
            name,
            role: role || 'user',
        });

        // Generate token
        const token = this.generateToken(user);

        return {
            user: {
                user_id: user.user_id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
            token,
            expires_in: JWT_EXPIRES_IN,
        };
    }

    /**
     * Login with email and password
     */
    async login(email: string, password: string): Promise<IAuthResult> {
        // Find user with password
        const user = await User.findOne({ email: email.toLowerCase() })
            .select('+password_hash');

        if (!user) {
            throw new Error('Invalid email or password');
        }

        // Compare passwords
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            throw new Error('Invalid email or password');
        }

        // Generate token
        const token = this.generateToken(user);

        return {
            user: {
                user_id: user.user_id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
            token,
            expires_in: JWT_EXPIRES_IN,
        };
    }

    /**
     * Verify a JWT token and return the payload
     */
    verifyToken(token: string): IJWTPayload {
        try {
            const payload = jwt.verify(token, JWT_SECRET) as IJWTPayload;
            return payload;
        } catch (error) {
            throw new Error('Invalid or expired token');
        }
    }

    /**
     * Generate a JWT token for a user
     */
    private generateToken(user: IUser): string {
        const payload: IJWTPayload = {
            user_id: user.user_id,
            email: user.email,
            role: user.role,
        };

        // Convert expiry to seconds (7 days default)
        const expiresInSeconds = this.parseExpiryToSeconds(JWT_EXPIRES_IN);

        return jwt.sign(payload, JWT_SECRET, {
            expiresIn: expiresInSeconds,
        });
    }

    /**
     * Parse expiry string to seconds
     */
    private parseExpiryToSeconds(expiry: string): number {
        const match = expiry.match(/^(\d+)([smhd])$/);
        if (!match) {
            return 7 * 24 * 60 * 60; // Default: 7 days
        }
        const value = parseInt(match[1], 10);
        const unit = match[2];
        switch (unit) {
            case 's': return value;
            case 'm': return value * 60;
            case 'h': return value * 60 * 60;
            case 'd': return value * 24 * 60 * 60;
            default: return 7 * 24 * 60 * 60;
        }
    }

    /**
     * Get user by ID
     */
    async getUserById(userId: string): Promise<IUser | null> {
        return User.findOne({ user_id: userId });
    }

    /**
     * Get user by email
     */
    async getUserByEmail(email: string): Promise<IUser | null> {
        return User.findOne({ email: email.toLowerCase() });
    }

    /**
     * Check if a user is admin
     */
    isAdmin(user: IUser | IJWTPayload): boolean {
        return user.role === 'admin';
    }
}

// Singleton instance
export const authService = new AuthService();
