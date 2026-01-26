"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const AuthService_1 = require("../services/AuthService");
const authMiddleware_1 = require("../middleware/authMiddleware");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = (0, express_1.Router)();
// Validation schemas
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    name: zod_1.z.string().min(1).max(100).optional(),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
/**
 * Register a new user
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
    try {
        // Validate input
        const validation = registerSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: validation.error.issues.map(i => i.message).join(', ')
            });
        }
        const { email, password, name } = validation.data;
        // Register user
        const result = await AuthService_1.authService.register(email, password, name);
        return res.status(201).json(result);
    }
    catch (error) {
        if (error.message === 'Email already registered') {
            return res.status(409).json({ error: error.message });
        }
        console.error('Registration error:', error);
        return res.status(500).json({ error: 'Registration failed' });
    }
});
/**
 * Login with email and password
 * POST /api/auth/login
 */
router.post('/login', rateLimiter_1.loginLimiter, async (req, res) => {
    try {
        // Validate input
        const validation = loginSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: validation.error.issues.map(i => i.message).join(', ')
            });
        }
        const { email, password } = validation.data;
        // Login
        const result = await AuthService_1.authService.login(email, password);
        return res.json(result);
    }
    catch (error) {
        if (error.message === 'Invalid email or password') {
            return res.status(401).json({ error: error.message });
        }
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Login failed' });
    }
});
/**
 * Get current user info
 * GET /api/auth/me
 */
router.get('/me', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const user = await AuthService_1.authService.getUserById(req.user.user_id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.json({
            user_id: user.user_id,
            email: user.email,
            name: user.name,
            role: user.role,
            created_at: user.created_at,
        });
    }
    catch (error) {
        console.error('Get user error:', error);
        return res.status(500).json({ error: 'Failed to get user info' });
    }
});
/**
 * Verify token is valid
 * GET /api/auth/verify
 */
router.get('/verify', authMiddleware_1.requireAuth, (req, res) => {
    return res.json({
        valid: true,
        user: req.user
    });
});
exports.default = router;
//# sourceMappingURL=auth.js.map