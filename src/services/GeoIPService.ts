import { redis } from '../config/database';

/**
 * GeoIP Service
 * Provides IP-based geolocation using free ip-api.com service
 * Caches results to minimize API calls
 */

interface GeoIPResult {
    country: string;
    countryCode: string;
    city: string;
    lat: number;
    lon: number;
    timezone: string;
}

const CACHE_TTL = 86400; // 24 hours
const CACHE_PREFIX = 'geoip:';

/**
 * Lookup geolocation for an IP address
 * Uses ip-api.com free tier (45 requests/minute for non-commercial use)
 */
export async function lookupIP(ip: string): Promise<GeoIPResult | null> {
    // Skip local/private IPs
    if (isPrivateIP(ip)) {
        return {
            country: 'Local',
            countryCode: 'LOCAL',
            city: 'localhost',
            lat: 0,
            lon: 0,
            timezone: 'UTC'
        };
    }

    // Check cache first
    try {
        const cached = await redis.get(`${CACHE_PREFIX}${ip}`);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch {
        // Ignore cache errors
    }

    // Call ip-api.com (free, no API key needed)
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,city,lat,lon,timezone`);
        
        if (!response.ok) {
            console.warn(`GeoIP lookup failed for ${ip}: ${response.status}`);
            return null;
        }

        interface IPAPIResponse {
            status: string;
            message?: string;
            country?: string;
            countryCode?: string;
            city?: string;
            lat?: number;
            lon?: number;
            timezone?: string;
        }

        const data = await response.json() as IPAPIResponse;
        
        if (data.status !== 'success') {
            console.warn(`GeoIP lookup failed for ${ip}: ${data.message || 'Unknown error'}`);
            return null;
        }

        const result: GeoIPResult = {
            country: data.country || 'Unknown',
            countryCode: data.countryCode || 'XX',
            city: data.city || 'Unknown',
            lat: data.lat || 0,
            lon: data.lon || 0,
            timezone: data.timezone || 'UTC'
        };

        // Cache the result
        try {
            await redis.setex(`${CACHE_PREFIX}${ip}`, CACHE_TTL, JSON.stringify(result));
        } catch {
            // Ignore cache errors
        }

        return result;
    } catch (error) {
        console.error(`GeoIP lookup error for ${ip}:`, error);
        return null;
    }
}

/**
 * Get country code for an IP address
 * Returns 2-letter ISO country code or 'XX' for unknown
 */
export async function getCountryCode(ip: string): Promise<string> {
    const result = await lookupIP(ip);
    return result?.countryCode || 'XX';
}

/**
 * Get country name for an IP address
 */
export async function getCountryName(ip: string): Promise<string> {
    const result = await lookupIP(ip);
    return result?.country || 'Unknown';
}

/**
 * Check if IP is private/local
 */
function isPrivateIP(ip: string): boolean {
    if (!ip || ip === 'unknown') return true;
    
    // IPv4 private ranges
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('172.')) {
        const second = parseInt(ip.split('.')[1], 10);
        if (second >= 16 && second <= 31) return true;
    }
    
    // IPv6 local
    if (ip.startsWith('fe80:') || ip.startsWith('fc00:') || ip.startsWith('fd00:')) return true;
    
    return false;
}

export const geoIPService = {
    lookupIP,
    getCountryCode,
    getCountryName,
    isPrivateIP
};
