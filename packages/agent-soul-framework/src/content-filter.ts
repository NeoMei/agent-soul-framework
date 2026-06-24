import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ContentFilter — 审宝内容审查器
 * 在消息到达 LLM 之前进行代码层拦截
 * 对 readonly 用户强制执行话题限制
 */

export class ContentFilter {
    // 专业话题关键词（正面匹配）
    static PROFESSIONAL_KEYWORDS: string[] = [
        "审计", "审阅", "审计程序", "审计证据", "审计底稿", "审计报告",
        "CSA", "CAS", "审计准则", "职业道德", "独立性",
        "抽样", "实质性程序", "控制测试", "风险评估",
        "会计", "会计准则", "财务报表", "资产负债表", "利润表", "现金流量表",
        "收入确认", "金融工具", "合并报表", "长期股权投资", "所得税",
        "资产减值", "政府补助", "租赁", "股份支付", "或有事项",
        "内控", "内部控制", "控制环境", "控制活动",
        "信息与沟通", "内部监督", "COSO", "五要素",
        "风险管理", "风险识别", "风险应对", "风险矩阵",
        "税务", "增值税", "企业所得税", "个人所得税", "印花税",
        "税收筹划", "税务稽查", "税收优惠", "汇算清缴",
        "合规", "法规", "监管", "证监会", "银保监会",
        "上市公司", "信息披露", "关联交易", "资金占用",
        "财务分析", "财务比率", "盈利能力", "偿债能力", "营运能力",
        "杜邦分析", "EVA", "ROI", "ROE", "毛利率",
        "舞弊", "欺诈", "贪污", "挪用", "造假", "虚增收入",
        "关联方舞弊", "串通舞弊", "举报", "调查程序",
        "职业规划", "考证", "CPA", "ACCA", "CMA", "CIA",
        "注册会计师", "中级会计", "高级会计", "职称",
        "四大会计师事务所", "事务所", "企业财务", "CFO",
        "IPO", "并购重组", "尽职调查", "估值", "现金流",
        "预算", "成本控制", "管理会计", "财务共享", "ERP",
    ];

    static CASUAL_KEYWORDS: string[] = [
        "天气", "今天几号", "几点了", "吃饭", "好吃", "美食",
        "电影", "电视剧", "综艺", "明星", "娱乐", "八卦",
        "游戏", "王者荣耀", "吃鸡", "LOL", "原神",
        "笑话", "段子", "搞笑", "幽默",
        "爱情", "恋爱", "分手", "失恋", "暧昧", "表白",
        "心情", "难过", "开心", "郁闷", "焦虑", "压力大",
        "寂寞", "孤独", "想你了", "抱抱", "亲亲",
        "购物", "淘宝", "京东", "拼多多", "外卖",
        "旅游", "vacation", "请假", "周末去哪",
        "宠物", "猫", "狗", "养",
        "讲个故事", "聊聊天", "随便说说", "在吗", "你好",
        "你是谁", "你会什么", "你能做什么",
    ];

    static REJECTION_MESSAGE =
        "您好，我是审宝，专注于审计与会计领域的专业客服。" +
        "您的问题不在我的服务范围内，请提问与审计、会计、内控、风险管理或职业规划相关的问题。";

    static classify(text: string): "professional" | "casual" | "neutral" {
        const normalizedText = text.toLowerCase().trim();

        let professionalScore = 0;
        for (const keyword of this.PROFESSIONAL_KEYWORDS) {
            if (normalizedText.includes(keyword.toLowerCase())) {
                professionalScore += 1;
                if (["审计", "会计", "内控", "准则", "报表", "CPA", "CAS", "CSA"].includes(keyword)) {
                    professionalScore += 2;
                }
            }
        }

        let casualScore = 0;
        for (const keyword of this.CASUAL_KEYWORDS) {
            if (normalizedText.includes(keyword.toLowerCase())) {
                casualScore += 1;
            }
        }

        if (professionalScore >= 2) return "professional";
        if (casualScore >= 1) return "casual";
        if (professionalScore > 0) return "professional";
        return "neutral";
    }

    static shouldBlock(text: string, permissionLevel: string): boolean {
        if (permissionLevel === "admin") return false;
        if (!text || text.trim().length === 0) return false;

        const classification = this.classify(text);
        if (classification === "casual") return true;
        return false;
    }

    static getRejectionMessage(): string {
        return this.REJECTION_MESSAGE;
    }

    static logBlock(text: string, userId: string, classification: string): void {
        const timestamp = new Date().toISOString();
        const { createHash } = require("node:crypto") as typeof import("node:crypto");
        const uidHash = createHash("sha256").update(String(userId)).digest("hex").substring(0, 12);
        const logEntry = `[${timestamp}] BLOCKED user=${uidHash} classification=${classification} text="${text.substring(0, 100)}"\n`;

        try {
            const fs = require("node:fs") as typeof import("node:fs");
            const path = require("node:path") as typeof import("node:path");
            const logDir = path.join(process.cwd(), "logs");
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
            fs.appendFileSync(path.join(logDir, "content-filter.log"), logEntry);
        } catch {
            // 日志写入失败不影响主流程
        }
    }
}

export default ContentFilter;
