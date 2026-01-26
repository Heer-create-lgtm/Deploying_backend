import { Request, Response, NextFunction } from 'express';
import { IJWTPayload } from '../services/AuthService';
/**
 * Extended Request with user information
 */
export interface IAuthenticatedRequest extends Request {
    user?: IJWTPayload;
}
/**
 * Require Authentication Middleware
 * Verifies JWT token and attaches user to request
 */
export declare const requireAuth: (req: IAuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Require Admin Role Middleware
 * Must be used after requireAuth
 */
export declare const requireAdmin: (req: IAuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Require Hub Ownership Middleware
 * Checks if user owns the hub or is admin
 * Must be used after requireAuth
 * Expects hub_id in request params
 */
export declare const requireOwnership: (req: IAuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Optional Auth Middleware
 * Attaches user to request if valid token present, but doesn't require it
 */
export declare const optionalAuth: (req: IAuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=authMiddleware.d.ts.map