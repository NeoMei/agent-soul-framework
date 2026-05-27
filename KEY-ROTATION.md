# 密钥轮换清单

> 以下密钥曾出现在 GitHub 公开仓库中，建议尽快轮换。

| # | 密钥类型 | 泄露值（部分） | 平台 | 操作 |
|---|---------|--------------|------|------|
| 1 | 豆包 TTS API Key | `b54cd9ff-08fc-4fa1-88a4-...` | [智声云](https://tts-api.dubbingx.com) | 重新生成 API Key |
| 2 | 豆包 TTS API Secret | `d67ff3a2-49e8-4f91-b409-...` | [智声云](https://tts-api.dubbingx.com) | 重新生成 API Secret |
| 3 | 阿里云 DashScope API Key | `sk-ed02da...2466` | [阿里云百炼控制台](https://bailian.console.aliyun.com) | 禁用旧 Key，创建新 Key |
| 4 | imgtg.com 上传 Token | `227\|RVBZau...w6Yf` | [imgtg.com](https://imgtg.com) 账户设置 | 重新生成 Token |
| 5 | 飞书 App ID | `cli_a9298a2012b8dcc7` | [飞书开放平台](https://open.feishu.cn) | App ID 本身公开无害，但建议检查 App Secret 是否安全 |

## 轮换后更新位置

轮换后需要将新密钥写入 `.env` 文件：

```bash
DOUBAO_API_KEY=新key
DOUBAO_API_SECRET=新secret
DASHSCOPE_API_KEY=新key
IMGTG_TOKEN=新token
FEISHU_APP_ID=cli_xxxxx（如更换）
```
