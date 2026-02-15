import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/AuthService';
import { requireAuth, IAuthenticatedRequest } from '../middleware/authMiddleware';
import { loginLimiter } from '../middleware/rateLimiter';

const router = Router();

// Validation schemas
const registerSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
});

/**
 * Register a new user
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response) => {
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
        const result = await authService.register(email, password, name);

        return res.status(201).json(result);
    } catch (error: any) {
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
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
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
        const result = await authService.login(email, password);

        return res.json(result);
    } catch (error: any) {
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
router.get('/me', requireAuth, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const user = await authService.getUserById(req.user.user_id);
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
    } catch (error) {
        console.error('Get user error:', error);
        return res.status(500).json({ error: 'Failed to get user info' });
    }
});

/**
 * Verify token is valid
 * GET /api/auth/verify
 */
router.get('/verify', requireAuth, (req: IAuthenticatedRequest, res: Response) => {
    return res.json({
        valid: true,
        user: req.user
    });
});

export default router;
