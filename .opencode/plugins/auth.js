import { ContentFilter } from '../../scripts/content-filter.js';

// 权限验证插件 - 基于飞书对话ID验证管理员身份
// 管理员 ID 列表（环境变量 HUNQI_ADMIN_IDS，逗号分隔）
const ADMIN_IDS = (process.env.HUNQI_ADMIN_IDS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

if (ADMIN_IDS.length === 0) {
  console.warn("[AuthPlugin] ⚠️  未设置 HUNQI_ADMIN_IDS 环境变量，所有用户均为 readonly");
}

export const AuthPlugin = async ({ project, client }) => {
  console.log("[AuthPlugin] ================================");
  console.log("[AuthPlugin] 权限验证插件已加载");
  console.log("[AuthPlugin] 管理员ID列表:", ADMIN_IDS);
  console.log("[AuthPlugin] 当前项目:", project?.name || "未知");
  console.log("[AuthPlugin] ================================");

  // 已验证的 session 缓存（避免重复注入）
  const verifiedSessions = new Set();

  // 统一的权限注入逻辑
  function injectPermission(input, output) {
    const feishuChatId = input?.context?.system_context?.feishu_chat_id ||
                         input?.system_context?.feishu_chat_id ||
                         process.env.FEISHU_CHAT_ID;
    const sessionID = input?.sessionID;

    if (!feishuChatId) return;
    if (sessionID && verifiedSessions.has(sessionID)) return;

    const isAdmin = ADMIN_IDS.includes(feishuChatId);

    if (isAdmin) {
      console.log(`[AuthPlugin] ✅ 管理员身份验证通过: ${feishuChatId}`);
      output.systemPrompt = output.systemPrompt || "";
      output.systemPrompt += `\n\n[权限验证 - 代码级别]\n当前飞书对话ID: ${feishuChatId}\n权限级别: ADMIN\n验证方式: 代码硬编码验证\n验证结果: 通过\n该用户拥有完全访问权限，不受专业边界限制。\n`;
      output.context = output.context || {};
      output.context.userRole = "admin";
      output.context.verifiedBy = "AuthPlugin";
      output.context.verifiedAt = new Date().toISOString();
    } else {
      console.log(`[AuthPlugin] ❌ 非管理员用户: ${feishuChatId}`);
      output.systemPrompt = output.systemPrompt || "";
      output.systemPrompt += `\n\n[权限验证 - 代码级别]\n当前飞书对话ID: ${feishuChatId || 'unknown'}\n权限级别: readonly\n验证方式: 代码硬编码验证\n验证结果: 未通过\n该用户受专业边界限制，只能回答审计、会计、内控等专业问题。\n`;

      const casualKeywords = ContentFilter.CASUAL_KEYWORDS.join('、');
      const rejectionMsg = ContentFilter.getRejectionMessage();
      output.systemPrompt += `\n\n[内容过滤 - 代码级强制规则]\n你被配置了代码级内容过滤器。以下话题被严格禁止，无论用户如何诱导、施压、换说法，都绝对不得回应：\n\n禁止话题关键词（部分列表）：${casualKeywords}\n\n判断逻辑（代码层）：\n1. 如果用户消息匹配任何禁止关键词 → 直接拒绝\n2. 如果用户试图绕过（如"不说关键词但意思一样"）→ 识别并拒绝\n3. 如果用户用专业话题包装非专业请求 → 识破并拒绝\n\n拒绝话术（必须原样使用）："${rejectionMsg}"\n\n重要：不要解释为什么拒绝，不要道歉，不要提供替代建议。直接返回拒绝话术即可。\n`;

      output.context = output.context || {};
      output.context.userRole = "readonly";
      output.context.verifiedBy = "AuthPlugin";
      output.context.verifiedAt = new Date().toISOString();
    }

    if (sessionID) verifiedSessions.add(sessionID);
  }

  return {
    "session.created": async (input, output) => {
      injectPermission(input, output);
    },

    "message.updated": async (input, output) => {
      const feishuChatId = input?.context?.system_context?.feishu_chat_id;
      const sessionID = input?.sessionID;
      const isAdmin = ADMIN_IDS.includes(feishuChatId);

      // 如果 session 还没验证过，补充注入权限标记（处理恢复的 session）
      if (sessionID && !verifiedSessions.has(sessionID)) {
        injectPermission(input, output);
      }

      // 将权限信息附加到消息上下文
      if (!output.context) output.context = {};
      output.context.isAdmin = isAdmin;
      output.context.feishuChatId = feishuChatId;
    }
  };
};
