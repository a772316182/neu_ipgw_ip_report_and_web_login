import axios from 'axios';
import * as cheerio from 'cheerio';
import {CookieJar} from 'tough-cookie';
import {wrapper} from 'axios-cookiejar-support';
// @ts-ignore
import URLSearchParams from 'url-search-params';
import pino from "pino";

const logger = pino();

interface LoginResponseResult {
    success: boolean;
    message: string;
}

export default class IpgwLogin {
    private stu_ID: string;
    private stu_password: string;
    private config: any;  // 添加配置属性

    constructor(stuID: string, stuPassword: string, config: any) {  // 修改构造函数接收配置
        this.stu_ID = stuID;
        this.stu_password = stuPassword;
        this.config = config;
    }

    /**
     * 提取 lt 字段
     */
    private extractLoginToken(pageContent: string): string | null {
        const $ = cheerio.load(pageContent);
        return $('input[type=hidden][id=lt][name=lt]').val()?.toString() ?? null;
    }

    /**
     * 提取 execution 字段
     */
    private extractExecution(pageContent: string): string | null {
        const $ = cheerio.load(pageContent);
        return $('input[type=hidden][name=execution]').val()?.toString() ?? null;
    }

    /**
     * 创建带 cookie 支持的 axios 实例
     */
    private createClient(): ReturnType<typeof wrapper> {
        const jar = new CookieJar();
        return wrapper(axios.create({jar, withCredentials: true}));
    }

    /**
     * 登录核心方法
     */
    public async loginWithAcId(ac_id: number): Promise<LoginResponseResult> {
        try {
            const client = this.createClient();

            // Step 1: 获取登录页面并解析 token
            const getPassPageUrl = this.config.ipgw_login.login_url_template.replace('%s', ac_id.toString());
            const getResponse = await client.get(getPassPageUrl, {
                maxRedirects: 0,
                timeout: this.config.ipgw_login.timeout,
            });

            const pageContent = getResponse.data as string;
            const lt = this.extractLoginToken(pageContent);
            const execution = this.extractExecution(pageContent);

            if (!lt || !execution) {
                return {success: false, message: '未能提取 lt 或 execution 参数'};
            }

            // Step 2: 构造加密参数
            const rsa = this.stu_ID + this.stu_password + lt;
            const ul = this.stu_ID.length;
            const pl = this.stu_password.length;

            const postData = new URLSearchParams({
                rsa,
                ul: ul.toString(),
                pl: pl.toString(),
                lt,
                execution,
                _eventId: 'submit'
            });

            // Step 3: 提交登录表单
            const postResponse = await client.post(getPassPageUrl, postData.toString(), {
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                maxRedirects: 0,
                timeout: this.config.ipgw_login.timeout,
                validateStatus: status => status >= 200 && status < 400
            });

            // Step 4: 处理 SSO 重定向
            const location = postResponse.headers['location'];
            if (!location) {
                return {success: false, message: '未能获取到重定向的URL'};
            }

            const ssoUrl = location.replace('http://ipgw.neu.edu.cn/', 'http://ipgw.neu.edu.cn/v1/');
            const ssoResponse = await client.get(ssoUrl, {timeout: this.config.ipgw_login.timeout});

            if (typeof ssoResponse.data.message === 'string' && ssoResponse.data.message.includes('success')) {
                return {success: true, message: 'SSO login successful'};
            }

            return {success: false, message: 'SSO login failed'};

        } catch (error: any) {
            return {success: false, message: error.message};
        }
    }

    /**
     * 尝试多个 ac_id 登录
     */
    public async login(): Promise<boolean> {
        for (const ac_id of this.config.ipgw_login.default_ac_ids) {
            logger.info(`Attempting connection, ac_id: ${ac_id}`);
            const result = await this.loginWithAcId(ac_id);
            if (result.success) {
                logger.info('Login successful');
                return true;
            } else {
                logger.warn(`ac_id=${ac_id} login failed: ${result.message}`);
            }
        }

        logger.error('Failed to connect to all network access points');
        return false;
    }
}