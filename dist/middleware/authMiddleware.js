"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.requireOwnership = exports.requireAdmin = exports.requireAuth = void 0;
const AuthService_1 = require("../services/AuthService");
const LinkHub_1 = require("../models/LinkHub");
/**
 * Require Authentication Middleware
 * Verifies JWT token and attaches user to request
 */
const requireAuth = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'No token provided' });
            return;
        }
        const token = authHeader.substring(7);
        // Verify token
        const payload = AuthService_1.authService.verifyToken(token);
        req.user = payload;
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};
exports.requireAuth = requireAuth;
/**
 * Require Admin Role Middleware
 * Must be used after requireAuth
 */
const requireAdmin = async (req, res, next) => {
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
exports.requireAdmin = requireAdmin;
/**
 * Require Hub Ownership Middleware
 * Checks if user owns the hub or is admin
 * Must be used after requireAuth
 * Expects hub_id in request params
 */
const requireOwnership = async (req, res, next) => {
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
    const hub = await LinkHub_1.LinkHub.findOne({ hub_id: hubId });
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
exports.requireOwnership = requireOwnership;
/**
 * Optional Auth Middleware
 * Attaches user to request if valid token present, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const payload = AuthService_1.authService.verifyToken(token);
            req.user = payload;
        }
    }
    catch {
        // Ignore errors - token is optional
    }
    next();
};
exports.optionalAuth = optionalAuth;
//# sourceMappingURL=authMiddleware.js.map