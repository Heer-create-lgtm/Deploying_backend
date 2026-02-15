/**
 * Vercel Serverless Entry Point
 * Wraps the Express app for Vercel's serverless environment.
 * All routes are handled by this single function.
 */
import app from '../src/index';

export default app;
