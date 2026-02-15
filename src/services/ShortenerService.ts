/**
 * ShortenerService - Native URL shortening using free APIs
 * Replaces the Python microservice with direct HTTP calls
 * Supports: TinyURL, is.gd, da.gd, clck.ru
 */

export type ShortenerProvider = 'tinyurl' | 'isgd' | 'dagd' | 'clckru';

export interface ShortenResult {
    short_url: string;
    original_url: string;
    provider: string;
    note?: string;
}

// Provider API configurations
const PROVIDER_APIS: Record<ShortenerProvider, (url: string) => { apiUrl: string; method: string; body?: string; headers?: Record<string, string>; parseResponse: (text: string) => string }> = {
    tinyurl: (url: string) => ({
        apiUrl: `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
        method: 'GET',
        parseResponse: (text: string) => text.trim(),
    }),
    isgd: (url: string) => ({
        apiUrl: `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
        method: 'GET',
        parseResponse: (text: string) => text.trim(),
    }),
    dagd: (url: string) => ({
        apiUrl: `https://da.gd/s?url=${encodeURIComponent(url)}`,
        method: 'GET',
        parseResponse: (text: string) => text.trim(),
    }),
    clckru: (url: string) => ({
        apiUrl: `https://clck.ru/--?url=${encodeURIComponent(url)}`,
        method: 'GET',
        parseResponse: (text: string) => text.trim(),
    }),
};

class ShortenerService {
    /**
     * Shorten a URL using a free URL shortening API
     */
    async shortenUrl(url: string, provider: ShortenerProvider = 'tinyurl'): Promise<ShortenResult> {
        const config = PROVIDER_APIS[provider];
        if (!config) {
            throw new Error(`Unsupported provider: ${provider}`);
        }

        const { apiUrl, method, body, headers, parseResponse } = config(url);

        try {
            const response = await fetch(apiUrl, {
                method,
                headers: headers || {},
                body,
                signal: AbortSignal.timeout(10000), // 10s timeout
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`${provider} returned ${response.status}: ${errorText}`);
            }

            const responseText = await response.text();
            const shortUrl = parseResponse(responseText);

            if (!shortUrl || !shortUrl.startsWith('http')) {
                throw new Error(`Invalid response from ${provider}: ${responseText}`);
            }

            return {
                short_url: shortUrl,
                original_url: url,
                provider,
            };
        } catch (error: any) {
            if (error.name === 'TimeoutError' || error.name === 'AbortError') {
                throw new Error(`${provider} timed out after 10 seconds`);
            }
            throw error;
        }
    }

    /**
     * Check if the shortener service is available
     * Since we use public APIs directly, we just verify TinyURL is reachable
     */
    async isAvailable(): Promise<boolean> {
        try {
            const response = await fetch('https://tinyurl.com/api-create.php?url=https://example.com', {
                signal: AbortSignal.timeout(5000),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Expand a shortened URL by following redirects
     */
    async expandUrl(url: string): Promise<{ original_url: string; short_url: string }> {
        try {
            const response = await fetch(url, {
                method: 'HEAD',
                redirect: 'follow',
                signal: AbortSignal.timeout(10000),
            });

            return {
                original_url: response.url,
                short_url: url,
            };
        } catch (error: any) {
            throw new Error(`Failed to expand URL: ${error.message}`);
        }
    }
}

export const shortenerService = new ShortenerService();
