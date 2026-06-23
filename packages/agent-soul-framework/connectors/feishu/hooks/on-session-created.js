// on-session-created.js — session hook (cross-platform)
// 灵魂注入已统一由 hunqi-plugin（OpenCode 插件）处理，此脚本保留用于未来扩展
// 环境变量: HOOK_SESSION_ID, HOOK_OPENCODE_URL

const sessionId = process.env.HOOK_SESSION_ID || "?";
console.log(`[hook:on-session-created] session=${sessionId} — 灵魂注入由 hunqi-plugin 统一处理 ✅`);
