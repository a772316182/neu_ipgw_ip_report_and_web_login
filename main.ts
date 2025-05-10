import * as yaml from 'js-yaml';
import * as fs from 'fs';
import IpgwLogin from "./IpgwLogin";
import IPExtractor from "./IPExtractor";

// 加载配置
const CONFIG_PATH = './config.yml'; // 确保路径正确指向你的配置文件
const config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8')) as {
    credentials: { username: string; password: string }
    application: { check_interval_ms: number; retry_delay_ms: number; max_retries: number }
};

// 修改后的CONFIG定义仅保留应用程序级配置
const CONFIG = {
    checkIntervalMs: config.application.check_interval_ms, // 从YAML配置中读取
    retryDelayMs: config.application.retry_delay_ms,       // 从YAML配置中读取
    maxRetries: config.application.max_retries            // 从YAML配置中读取
};

// 日志工具（方便未来替换为 winston / pino 等）
const logger = {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
};

/**
 * 主任务函数
 */
async function runTask(): Promise<void> {
    const login = new IpgwLogin(config.credentials.username, config.credentials.password, config); // 传递配置
    const extractor = new IPExtractor(login, config);     // 传递配置

    try {
        logger.info("Starting IP query...");

        const ip = await extractor.queryIP();
        if (ip) {
            logger.info(`Successfully obtained IP address: ${ip}`);
        } else {
            logger.warn("Failed to obtain a valid IP address");
        }
    } catch (error: any) {
        logger.error(`An error occurred during execution: ${error.message}`);
    }
}

/**
 * 使用 setTimeout 安全地循环执行任务
 */
async function scheduleTask(): Promise<void> {
    await runTask();

    logger.info(`Scheduling next task in ${CONFIG.checkIntervalMs}ms`);
    setTimeout(async () => {
        await scheduleTask(); // 确保前一个任务完成后才开始下一个
    }, CONFIG.checkIntervalMs);
}

/**
 * 启动程序入口
 */
async function main() {
    logger.info("Program started, beginning periodic IP checks...");

    await scheduleTask(); // 开始首次运行
}

// 启动程序
main().catch(err => {
    console.error("程序启动失败:", err);
});