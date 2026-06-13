#!/usr/bin/env bun
/**
 * Agent的PPT生成技能
 * 基于 baoyu-slide-deck 提示词模板 + 即梦API生成图片
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// ============ 配置 ============
const JIMENG_API_KEY = process.env.JIMENG_API_KEY || "";
const JIMENG_MODEL = "doubao-seedream-5-0-260128";
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || "";
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || "";

// ============ 风格提示词模板 ============
const STYLE_PROMPTS: Record<string, string> = {
  "sketch-notes": `PPT幻灯片页面，手绘笔记风格sketch-notes，暖白色纸质背景#FAF8F0，手写马克笔字体，手绘笔触，深灰色文字#2C3E50，橙色高亮#F4A261，黄色强调#E9C46A，绿色图标#87A96B，浅蓝色科技元素#7EC8E3，手绘波浪线条，抽象概念图标，圆角几何形状，简笔画装饰元素，开放简洁布局，手绘质感，教育知识分享风格`,
  
  "chalkboard": `PPT幻灯片页面，白板手绘风格chalkboard，深绿色黑板背景，木质边框，手写粉笔字体效果，手绘插图风格，温馨教学风格，简洁美观`,
  
  "blueprint": `PPT幻灯片页面，蓝图风格blueprint，网格背景，科技蓝色调，几何线条，专业的技术感，简洁清晰，适合架构设计`,
  
  "corporate": `PPT幻灯片页面，企业风格corporate，干净专业，几何布局，商务配色，现代简约，适合商业演示`,
  
  "minimal": `PPT幻灯片页面，极简风格minimal，简洁大方，大量留白，清晰简洁，适合 executive 演示`,
  
  "watercolor": `PPT幻灯片页面，水彩风格watercolor，柔和温暖，艺术感，优美轻盈，适合生活方式内容`,
  
  "dark-atmospheric": `PPT幻灯片页面，暗色调大气风格，深色背景，戏剧性灯光，适合娱乐游戏内容`,
  
  "notion": `PPT幻灯片页面，Notion风格，简洁中性，几何布局，信息密集，适合产品演示`,
};

// ============ 工具函数 ============

function printUsage() {
  console.log(`AgentPPT生成器

用法:
  bun run main.ts <内容文件> [选项]

选项:
  --style <风格>      视觉风格: sketch-notes, chalkboard, blueprint, corporate, minimal, watercolor, dark-atmospheric, notion (默认: sketch-notes)
  --slides <数量>     幻灯片数量 (默认: 5)
  --lang <语言>       语言: zh, en, ja (默认: zh)
  --output <目录>     输出目录 (默认: slide-deck/<主题>)

示例:
  bun run main.ts content.md --style sketch-notes --slides 8 --lang zh
`);
}

async function generateImage(prompt: string, size: string = "2576x1440"): Promise<Uint8Array> {
  const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${JIMENG_API_KEY}`,
    },
    body: JSON.stringify({
      model: JIMENG_MODEL,
      prompt,
      size,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API错误: ${error}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`生成失败: ${data.error.message}`);
  }

  const imageUrl = data.data[0].url;
  
  // 下载图片
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`下载图片失败: ${imageResponse.status}`);
  }
  
  return new Uint8Array(await imageResponse.arrayBuffer());
}

function extractTopicSlug(content: string): string {
  // 从标题行提取主题
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      const title = trimmed.slice(2).trim();
      return title
        .toLowerCase()
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "-")
        .slice(0, 30);
    }
  }
  return "untitled";
}

function countWords(content: string): number {
  // 简单统计中英文字数
  const chinese = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
  const english = (content.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}

function estimateSlideCount(content: string): number {
  const words = countWords(content);
  if (words < 500) return 3;
  if (words < 1000) return 5;
  if (words < 2000) return 8;
  if (words < 3000) return 10;
  return Math.min(15, Math.ceil(words / 300));
}

// ============ 大纲生成 ============

function generateOutline(content: string, slideCount: number, style: string): string {
  const lines = content.split("\n");
  let title = "未命名";
  for (const line of lines) {
    if (line.trim().startsWith("# ")) {
      title = line.trim().slice(2);
      break;
    }
  }

  // 提取## 标题作为幻灯片主题
  const topics: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      topics.push(trimmed.slice(3).trim());
    }
  }

  // 如果没有足够的##，创建基于内容的主题
  while (topics.length < slideCount && topics.length > 0) {
    topics.push(topics[topics.length - 1] + "续");
  }

  let outline = `# ${title}\n\n`;
  outline += `## 大纲\n\n`;
  
  for (let i = 0; i < Math.min(slideCount, 10); i++) {
    const topicNum = i + 1;
    let topicName: string;
    
    if (i === 0) {
      topicName = "封面";
    } else if (i === 1) {
      topicName = "概述";
    } else if (i === topics.length) {
      topicName = "总结";
    } else {
      topicName = topics[i - 2] || `第${topicNum}点`;
    }
    
    outline += `${topicNum}. ${topicName}\n`;
  }
  
  return outline;
}

// ============ 幻灯片提示词生成 ============

function generateSlidePrompt(
  slideNum: number,
  totalSlides: number,
  topic: string,
  style: string,
  content: string
): string {
  const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS["sketch-notes"];
  
  // 提取相关内容
  let relevantContent = "";
  const lines = content.split("\n");
  for (const line of lines) {
    if (line.includes(topic) || line.startsWith("## ")) {
      relevantContent += line + "\n";
    }
  }
  
  // 根据幻灯片位置调整
  let positionHint = "";
  if (slideNum === 1) {
    positionHint = "封面页，大标题，震撼开场";
  } else if (slideNum === totalSlides) {
    positionHint = "结尾页，总结回顾";
  } else {
    positionHint = "内容页，要点清晰";
  }
  
  const prompt = `${stylePrompt}，${positionHint}，内容主题：${topic}，${relevantContent.slice(0, 200)}，幻灯片页面`;
  
  return prompt;
}

// ============ 主函数 ============

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const contentFile = args[0];
  
  // 解析选项
  let style = "sketch-notes";
  let slideCount = 5;
  let lang = "zh";
  let outputDir = "";
  
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--style" && args[i + 1]) {
      style = args[++i];
    } else if (arg === "--slides" && args[i + 1]) {
      slideCount = parseInt(args[++i], 10);
    } else if (arg === "--lang" && args[i + 1]) {
      lang = args[++i];
    } else if (arg === "--output" && args[i + 1]) {
      outputDir = args[++i];
    }
  }

  // 读取内容
  console.log("📖 读取内容文件...");
  const content = await readFile(contentFile, "utf-8");
  
  // 提取主题
  const topicSlug = extractTopicSlug(content);
  const outputPath = outputDir || `slide-deck/${topicSlug}`;
  
  console.log(`📁 输出目录: ${outputPath}`);
  console.log(`🎨 风格: ${style}`);
  console.log(`📊 幻灯片数量: ${slideCount}`);
  
  // 创建输出目录
  await mkdir(outputPath, { recursive: true });
  await mkdir(join(outputPath, "prompts"), { recursive: true });
  await mkdir(join(outputPath, "images"), { recursive: true });
  
  // 保存源文件
  await writeFile(join(outputPath, `source-${topicSlug}.md`), content);
  
  // 生成大纲
  console.log("\n📝 生成大纲...");
  const outline = generateOutline(content, slideCount, style);
  await writeFile(join(outputPath, "outline.md"), outline);
  console.log("✓ 大纲已生成");
  
  // 生成每张幻灯片的提示词和图片
  console.log("\n🎨 开始生成幻灯片图片...");
  
  const lines = content.split("\n");
  const topics: string[] = [];
  
  // 提取主题
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      topics.push(trimmed.slice(3).trim());
    }
  }
  
  if (topics.length === 0) {
    topics.push("内容概述", "主要特点", "应用场景", "总结");
  }
  
  const totalSlides = Math.min(slideCount, topics.length + 2); // +封面+结尾
  
  for (let i = 1; i <= totalSlides; i++) {
    const topicName = i === 1 ? "封面" : i === totalSlides ? "总结" : topics[i - 2] || `第${i}点`;
    
    console.log(`\n生成第 ${i}/${totalSlides} 张: ${topicName}`);
    
    // 生成提示词
    const prompt = generateSlidePrompt(i, totalSlides, topicName, style, content);
    const promptFile = join(outputPath, "prompts", `${i.toString().padStart(2, "0")}-slide-${topicName.slice(0, 10)}.md`);
    await writeFile(promptFile, prompt);
    
    // 生成图片
    try {
      const imageData = await generateImage(prompt);
      const imagePath = join(outputPath, "images", `${i.toString().padStart(2, "0")}-slide-${topicName.slice(0, 10)}.jpg`);
      await writeFile(imagePath, imageData);
      console.log(`  ✓ 已保存: ${imagePath}`);
    } catch (error) {
      console.error(`  ✗ 生成失败: ${error}`);
    }
  }
  
  console.log("\n✅ 完成！");
  console.log(`📂 输出目录: ${outputPath}`);
  console.log(`🖼️  图片数量: ${totalSlides}`);
}

main().catch(console.error);
