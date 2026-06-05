// read-plugin.js - OpenCode Plugin to override built-in read tool with PDF filtering
import { tool } from "@opencode-ai/plugin";
import fs from "fs";
import path from "path";

// 危险文件类型：read 工具会导致 base64 编码撑爆上下文
const DANGEROUS_EXTS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".ppt", ".pptx", ".odt", ".ods", ".odp",
  ".epub", ".mobi", ".azw3"
]);

// 二进制文件：可以用 bash 处理，但 read 会乱码
const BINARY_EXTS = new Set([
  ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2",
  ".exe", ".dll", ".so", ".dylib",
  ".mp3", ".mp4", ".avi", ".mov", ".mkv",
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
  ".woff", ".woff2", ".ttf", ".eot"
]);

function readFileContent(filePath, offset, limit) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const startIndex = Math.max(0, offset - 1);
  const endIndex = Math.min(lines.length, startIndex + limit);
  const selectedLines = lines.slice(startIndex, endIndex);

  const numberedLines = selectedLines.map((line, index) => {
    return `${startIndex + index + 1}: ${line}`;
  });

  return numberedLines.join("\n");
}

function formatDangerousFileResponse(filePath, ext) {
  const basename = path.basename(filePath);

  if (ext === ".pdf") {
    return `❌ read 工具已拦截 PDF 文件（防止 base64 编码撑爆上下文）

📄 文件: ${basename}
✅ 替代方案（自动选择最佳方式）：

【方式1 - 总结分析】
summarize "${filePath}" --model google/gemini-3-flash-preview

【方式2 - 问答/详细分析】
python3 skills/agent-gemini/scripts/ask_gemini.py "${filePath}" "请总结这份文件的核心内容"

【方式3 - 提取纯文本】
python3 -c "import pdfplumber; print(''.join(p.extract_text() for p in pdfplumber.open('${filePath}').pages))"

💡 推荐：方式1 最快，方式2 最灵活`;
  }

  if ([".doc", ".docx", ".odt"].includes(ext)) {
    return `❌ read 工具已拦截 Word 文档（防止编码问题）

📄 文件: ${basename}
✅ 替代方案：

【提取纯文本】
pandoc "${filePath}" -t plain

【转换为 Markdown】
pandoc "${filePath}" -t markdown -o output.md`;
  }

  if ([".xls", ".xlsx", ".ods"].includes(ext)) {
    return `❌ read 工具已拦截 Excel 表格（防止编码问题）

📄 文件: ${basename}
✅ 替代方案：

【查看表格结构】
python3 -c "
import pandas as pd
df = pd.read_excel('${filePath}')
print(df.head(20))
print(f'\\n总行数: {len(df)}')
print(f'列名: {list(df.columns)}')
"`;
  }

  if ([".ppt", ".pptx", ".odp"].includes(ext)) {
    return `❌ read 工具已拦截 PPT 文件（防止编码问题）

📄 文件: ${basename}
✅ 替代方案：

【提取文本内容】
python3 -c "
from pptx import Presentation
prs = Presentation('${filePath}')
for i, slide in enumerate(prs.slides):
    print(f'--- Slide {i+1} ---')
    for shape in slide.shapes:
        if hasattr(shape, 'text') and shape.text:
            print(shape.text)
"`;
  }

  return `❌ read 工具已拦截此文件类型 (${ext})（防止编码问题）

📄 文件: ${basename}
✅ 通用处理方案：

【查看文件信息】
file "${filePath}"
ls -lh "${filePath}"

【尝试提取文本】
pandoc "${filePath}" -t plain 2>/dev/null || strings "${filePath}" | head -100`;
}

// Plugin entry point - exported default function
export default function ReadPlugin(ctx) {
  return {
    tool: {
      read: tool({
        description: "Smart read tool with automatic file type filtering. Safe for text files, auto-redirects dangerous files (PDF, Office, etc.) to appropriate handlers.",
        args: {
          filePath: tool.schema.string().describe("The absolute path to the file or directory to read"),
          offset: tool.schema.number().optional().describe("Line number to start reading from (1-indexed)"),
          limit: tool.schema.number().optional().describe("Maximum number of lines to read (defaults to 2000)"),
        },
        async execute(args, context) {
          const filePath = args.filePath;
          const offset = args.offset || 1;
          const limit = args.limit || 2000;

          // 检查文件是否存在
          if (!fs.existsSync(filePath)) {
            return `Error: File or directory does not exist: ${filePath}`;
          }

          // 检查是否是目录
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) {
            const entries = fs.readdirSync(filePath);
            return entries.map((entry) => {
              const entryPath = path.join(filePath, entry);
              const entryStats = fs.statSync(entryPath);
              return entryStats.isDirectory() ? `${entry}/` : entry;
            }).join("\n");
          }

          // 获取文件扩展名和大小
          const ext = path.extname(filePath).toLowerCase();
          const fileSizeMB = stats.size / (1024 * 1024);

          // ===== 危险文件：自动拦截并给出替代方案 =====
          if (DANGEROUS_EXTS.has(ext)) {
            return formatDangerousFileResponse(filePath, ext);
          }

          // ===== 二进制文件：提醒用 bash =====
          if (BINARY_EXTS.has(ext)) {
            return `⚠️ 这是二进制文件 (${ext})，read 工具会显示乱码。

建议处理方式：
- 图片分析: python3 skills/agent-vision/scripts/vision.py "${filePath}" "描述图片内容"
- 音视频: python3 skills/agent-hearing/scripts/hear.py "${filePath}"
- 压缩包: unzip -l "${filePath}" 或 tar -tf "${filePath}"
- 字体/其他: 用 file 命令查看类型`;
          }

          // ===== 超大文本文件：分段读取提醒 =====
          if (fileSizeMB > 5) {
            return `⚠️ 文件过大 (${fileSizeMB.toFixed(1)} MB)，建议分段读取：

当前读取第 ${offset}-${offset + limit - 1} 行：
${readFileContent(filePath, offset, limit)}

如需继续读取：read "${filePath}" --offset ${offset + limit} --limit ${limit}`;
          }

          // ===== 正常文本文件：直接读取 =====
          return readFileContent(filePath, offset, limit);
        },
      }),
    },
  };
}
