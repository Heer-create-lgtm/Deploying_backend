/**
 * Test Configuration Validator
 * Validates required environment variables and ensures test isolation
 */

export interface ITestConfig {
    mongoUri: string;
    dbName: string;
    redisHost: string;
    redisPort: number;
    port: number;
    jwtSecret: string;
    hashSaltRounds: number;
    nodeEnv: string;
}

export class TestConfigValidator {
    private config: ITestConfig;
    private errors: string[] = [];

    constructor() {
        this.config = {
            mongoUri: process.env.MONGODB_URI || '',
            dbName: process.env.DB_NAME || '',
            redisHost: process.env.REDIS_HOST || 'localhost',
            redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
            port: parseInt(process.env.PORT || '3001', 10),
            jwtSecret: process.env.JWT_SECRET || '',
            hashSaltRounds: parseInt(process.env.HASH_SALT_ROUNDS || '10', 10),
            nodeEnv: process.env.NODE_ENV || '',
        };
    }

    /**
     * Validate all required configuration
     */
    validate(): { valid: boolean; errors: string[]; config: ITestConfig } {
        this.errors = [];

        // Ensure test environment
        if (this.config.nodeEnv !== 'test') {
            this.errors.push(`NODE_ENV must be 'test', got '${this.config.nodeEnv}'`);
        }

        // Ensure NOT production database
        if (this.config.mongoUri.includes('production') ||
            this.config.mongoUri.includes('prod')) {
            this.errors.push('CRITICAL: Production database detected! Use test database only.');
        }

        // Validate MongoDB
        if (!this.config.mongoUri) {
            this.errors.push('MONGODB_URI is required');
        } else if (!this.config.mongoUri.includes('-test')) {
            this.errors.push('MONGODB_URI should contain "-test" for isolation');
        }

        // Validate JWT secret
        if (!this.config.jwtSecret) {
            this.errors.push('JWT_SECRET is required');
        } else if (this.config.jwtSecret.length < 16) {
            this.errors.push('JWT_SECRET must be at least 16 characters');
        }

        // Validate hash salt rounds
        if (this.config.hashSaltRounds < 10) {
            this.errors.push('HASH_SALT_ROUNDS should be at least 10');
        }

        // Validate port
        if (this.config.port < 1024 || this.config.port > 65535) {
            this.errors.push('PORT must be between 1024 and 65535');
        }

        return {
            valid: this.errors.length === 0,
            errors: this.errors,
            config: this.config,
        };
    }

    /**
     * Fail immediately if validation fails
     */
    validateOrFail(): ITestConfig {
        const result = this.validate();
        if (!result.valid) {
            console.error('\n❌ Configuration Validation Failed:');
            result.errors.forEach((e) => console.error(`   - ${e}`));
            process.exit(1);
        }
        console.log('✓ Configuration validated successfully');
        return result.config;
    }
}

export const testConfigValidator = new TestConfigValidator();
