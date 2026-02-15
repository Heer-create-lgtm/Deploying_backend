import { Request, Response, NextFunction } from 'express';
import { authService, IJWTPayload } from '../services/AuthService';
import { LinkHub } from '../models/LinkHub';

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
export const requireAuth = async (
    req: IAuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'No token provided' });
            return;
        }

        const token = authHeader.substring(7);

        // Verify token
        const payload = authService.verifyToken(token);
        req.user = payload;

        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};

/**
 * Require Admin Role Middleware
 * Must be used after requireAuth
 */
export const requireAdmin = async (
    req: IAuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    if (req.user.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }

    next();
};

/**
 * Require Hub Ownership Middleware
 * Checks if user owns the hub or is admin
 * Must be used after requireAuth
 * Expects hub_id in request params
 */
export const requireOwnership = async (
    req: IAuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    // Admins have global access
    if (req.user.role === 'admin') {
        next();
        return;
    }

    const hubId = req.params.hub_id;
    if (!hubId) {
        res.status(400).json({ error: 'Hub ID required' });
        return;
    }

    // Check hub ownership
    const hub = await LinkHub.findOne({ hub_id: hubId });
    if (!hub) {
        res.status(404).json({ error: 'Hub not found' });
        return;
    }

    // Check if user owns the hub
    if (hub.owner_user_id && hub.owner_user_id !== req.user.user_id) {
        res.status(403).json({ error: 'Access denied: you do not own this hub' });
        return;
    }

    // Allow access to unowned hubs (legacy or public hubs)
    next();
};

/**
 * Optional Auth Middleware
 * Attaches user to request if valid token present, but doesn't require it
 */
export const optionalAuth = async (
    req: IAuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const payload = authService.verifyToken(token);
            req.user = payload;
        }
    } catch {
        // Ignore errors - token is optional
    }
    next();
};
