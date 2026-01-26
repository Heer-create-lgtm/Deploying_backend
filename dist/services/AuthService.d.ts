import { IUser, UserRole } from '../models/User';
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
export declare class AuthService {
    /**
     * Register a new user
     */
    register(email: string, password: string, name?: string, role?: UserRole): Promise<IAuthResult>;
    /**
     * Login with email and password
     */
    login(email: string, password: string): Promise<IAuthResult>;
    /**
     * Verify a JWT token and return the payload
     */
    verifyToken(token: string): IJWTPayload;
    /**
     * Generate a JWT token for a user
     */
    private generateToken;
    /**
     * Parse expiry string to seconds
     */
    private parseExpiryToSeconds;
    /**
     * Get user by ID
     */
    getUserById(userId: string): Promise<IUser | null>;
    /**
     * Get user by email
     */
    getUserByEmail(email: string): Promise<IUser | null>;
    /**
     * Check if a user is admin
     */
    isAdmin(user: IUser | IJWTPayload): boolean;
}
export declare const authService: AuthService;
//# sourceMappingURL=AuthService.d.ts.map