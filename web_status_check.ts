// @ts-ignore
import https from 'https';

interface NetworkStatus {
    online: boolean;
    error?: string;
}

/**
 * 检查网络状态
 * @param config
 */
export default function checkNetworkStatus(config: any): Promise<NetworkStatus> {
    const url = config.network_check.default_check_url;
    const timeout = config.network_check.timeout_ms;

    return new Promise((resolve) => {
        const req = https.get(url, {timeout: timeout}, (res) => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve({online: true});
            } else {
                resolve({online: false, error: `Unexpected status code: ${res.statusCode}`});
            }
            req.abort(); // 中断请求，因为我们只需要知道是否能连接，不需要完整的数据
        });

        req.on('error', (err) => {
            resolve({online: false, error: err.message});
        });

        req.on('timeout', () => {
            req.abort();
            resolve({online: false, error: 'Request timed out'});
        });
    });
}