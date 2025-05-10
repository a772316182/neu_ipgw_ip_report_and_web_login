import axios, { AxiosResponse } from "axios";
import IpgwLogin from "./IpgwLogin";
import checkNetworkStatus from "./web_status_check";
import pino from "pino";

const logger = pino();

// 配置信息

export default class IPExtractor {
    private ipgwLogin: IpgwLogin;
    private config: any;  // 添加配置属性

    constructor(ipgwLogin: IpgwLogin, config: any) {  // 修改构造函数接收配置
        this.ipgwLogin = ipgwLogin;
        this.config = config;
    }

    /**
     * 检查网络是否可达
     */
    public async pingHost(): Promise<boolean> {
        const status = await checkNetworkStatus(this.config);
        return status.online;
    }

    /**
     * 从 HTML 提取第一个匹配的 IP 地址
     */
    public extractIPFromHTML(html: string): string | null {
        const match = html.match(this.config.ip_extractor.regex_pattern);
        return match ? match[0] : null;
    }

    /**
     * 获取当前 IP 地址
     */
    public async queryIP(): Promise<string | null> {
        const isOnline = await this.pingHost();

        if (!isOnline) {
            logger.info("Network is unreachable, attempting to log in automatically");
            logger.info(`Wireless network (ac_id=${this.config.ip_extractor.ac_id_wireless}), Wired network (ac_id=${this.config.ip_extractor.ac_id_wired})`);

            const loginSuccess = await this.ipgwLogin.login();

            if (loginSuccess) {
                logger.info("Login successful");
            } else {
                logger.warn("Login failed");
                return null;
            }
        } else {
            logger.info("No need to log in");
        }

        try {
            logger.info("Executing IP query...");
            const response: AxiosResponse<string> = await axios.get(this.config.ip_extractor.ip_page_url);
            const ip = this.extractIPFromHTML(response.data);

            if (ip) {
                logger.info(`IP address: ${ip}`);
                return ip;
            } else {
                logger.warn("Failed to extract IP address from page");
                return null;
            }
        } catch (error: any) {
            logger.error(`Failed to request IP page: ${error.message}`);
            return null;
        }
    }
}