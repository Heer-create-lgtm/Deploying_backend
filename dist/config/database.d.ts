import Redis from 'ioredis';
export declare const connectMongoDB: () => Promise<void>;
declare class MockRedis {
    private store;
    private listStore;
    private expiries;
    constructor();
    on(event: string, callback: () => void): void;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<string>;
    setex(key: string, seconds: number, value: string): Promise<string>;
    expire(key: string, seconds: number): Promise<number>;
    del(...keys: string[]): Promise<number>;
    lpush(key: string, ...values: string[]): Promise<number>;
    rpop(key: string): Promise<string | null>;
    blpop(key: string, timeout: number): Promise<string | null>;
    brpop(key: string, timeout: number): Promise<string[] | null>;
    llen(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    ttl(key: string): Promise<number>;
    zadd(key: string, ...args: (string | number)[]): Promise<number>;
    zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
    zcard(key: string): Promise<number>;
    quit(): Promise<string>;
}
export declare const redis: MockRedis | Redis;
export declare const closeConnections: () => Promise<void>;
export {};
//# sourceMappingURL=database.d.ts.map