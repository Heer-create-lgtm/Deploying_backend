"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const User_1 = require("../models/User");
const JWT_SECRET = process.env.JWT_SECRET || 'smart-link-hub-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
/**
 * Authentication Service
 * Handles user registration, login, and JWT token management
 */
class AuthService {
    /**
     * Register a new user
     */
    async register(email, password, name, role) {
        // Check if email already exists
        const existing = await User_1.User.findOne({ email: email.toLowerCase() });
        if (existing) {
            throw new Error('Email already registered');
        }
        // Validate password strength
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }
        // Hash password
        const password_hash = await (0, User_1.hashPassword)(password);
        // Create user
        const user = await User_1.User.create({
            user_id: (0, uuid_1.v4)(),
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
    async login(email, password) {
        // Find user with password
        const user = await User_1.User.findOne({ email: email.toLowerCase() })
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
    verifyToken(token) {
        try {
            const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            return payload;
        }
        catch (error) {
            throw new Error('Invalid or expired token');
        }
    }
    /**
     * Generate a JWT token for a user
     */
    generateToken(user) {
        const payload = {
            user_id: user.user_id,
            email: user.email,
            role: user.role,
        };
        // Convert expiry to seconds (7 days default)
        const expiresInSeconds = this.parseExpiryToSeconds(JWT_EXPIRES_IN);
        return jsonwebtoken_1.default.sign(payload, JWT_SECRET, {
            expiresIn: expiresInSeconds,
        });
    }
    /**
     * Parse expiry string to seconds
     */
    parseExpiryToSeconds(expiry) {
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
    async getUserById(userId) {
        return User_1.User.findOne({ user_id: userId });
    }
    /**
     * Get user by email
     */
    async getUserByEmail(email) {
        return User_1.User.findOne({ email: email.toLowerCase() });
    }
    /**
     * Check if a user is admin
     */
    isAdmin(user) {
        return user.role === 'admin';
    }
}
exports.AuthService = AuthService;
// Singleton instance
exports.authService = new AuthService();
//# sourceMappingURL=AuthService.js.map