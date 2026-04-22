import { KnowledgeCard } from '../types';

/**
 * 卡片解析服务类
 * 负责解析LLM返回的卡片内容，转换为结构化数据和Markdown格式
 */
export class CardParserService {
  /**
   * 解析原始卡片内容为结构化数据
   */
  parseCardContent(content: string): KnowledgeCard {
    const cardData: KnowledgeCard = {
      "卡片名称": "未命名卡片",
      "核心定义": "",
      "关键要点": [],
      "作者情绪": "",
      "关联实体": "",
      "原文地址": ""
    };

    // 解析卡片名称
    if (content.includes("【卡片名称】：")) {
      const start = content.indexOf("【卡片名称】：") + "【卡片名称】：".length;
      const end = content.indexOf("\n", start);
      if (end !== -1) {
        cardData["卡片名称"] = content.substring(start, end).trim();
      }
    }

    // 解析核心定义
    if (content.includes("【核心定义】：")) {
      const start = content.indexOf("【核心定义】：") + "【核心定义】：".length;
      const end = content.indexOf("\n", start);
      if (end !== -1) {
        cardData["核心定义"] = content.substring(start, end).trim();
      }
    }

    // 解析关键要点
    if (content.includes("【关键要点】：")) {
      const start = content.indexOf("【关键要点】：") + "【关键要点】：".length;
      const end = content.indexOf("【作者情绪】：", start);
      if (end !== -1) {
        const pointsText = content.substring(start, end).trim();
        const points: string[] = [];
        for (const line of pointsText.split('\n')) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
            points.push(trimmedLine.substring(2).trim());
          }
        }
        cardData["关键要点"] = points;
      }
    }

    // 解析作者情绪
    if (content.includes("【作者情绪】：")) {
      const start = content.indexOf("【作者情绪】：") + "【作者情绪】：".length;
      const end = content.indexOf("【关联实体】：", start);
      if (end !== -1) {
        cardData["作者情绪"] = content.substring(start, end).trim();
      }
    }

    // 解析关联实体
    if (content.includes("【关联实体】：")) {
      const start = content.indexOf("【关联实体】：") + "【关联实体】：".length;
      const end = content.indexOf("【原文地址】：", start);
      if (end !== -1) {
        cardData["关联实体"] = content.substring(start, end).trim();
      }
    }

    // 解析原文地址
    if (content.includes("【原文地址】：")) {
      const start = content.indexOf("【原文地址】：") + "【原文地址】：".length;
      cardData["原文地址"] = content.substring(start).trim();
    }

    return cardData;
  }

  /**
   * 将结构化卡片数据转换为Markdown格式
   */
  cardToMarkdown(
    data: KnowledgeCard,
    cardId: string,
    sourcePath: string,
    sourceHash: string,
    extraSourcePaths: string[] = []
  ): string {
    const now = new Date();
    const timeString = now.toISOString().slice(0, 16).replace('T', ' ');
    const allSourcePaths = [sourcePath, ...extraSourcePaths].filter(p => p);
    const cardTitle = data["卡片名称"] || "未命名卡片";

    let markdown = `---
card_id: "${cardId}"
source_path: ${JSON.stringify(allSourcePaths.length > 1 ? allSourcePaths : sourcePath)}
source_hash: "${sourceHash}"
generated_at: "${timeString}"
generator: "Lite LLM Wiki v1.1"
aliases: ["${cardTitle.replace(/"/g, '\\"')}"]
---

# ${cardTitle}

## 核心定义
${data["核心定义"] || ""}

## 关键要点
`;

    // 处理关键要点
    const keyPoints = data["关键要点"] || [];
    for (const point of keyPoints) {
      markdown += `- ${point}\n`;
    }

    markdown += `\n## 作者情绪\n${data["作者情绪"] || ""}\n`;

    markdown += `\n## 关联实体\n${data["关联实体"] || ""}\n`;

    markdown += `\n## 原文地址\n${data["原文地址"] || ""}\n`;

    return markdown;
  }

  /**
   * 从Markdown内容中提取所有实体
   */
  extractEntitiesFromContent(content: string): string[] {
    const entities = new Set<string>();
    const matches = content.match(/\[\[(.*?)\]\]/g);

    if (matches) {
      for (const match of matches) {
        const entity = match.slice(2, -2).trim();
        // 过滤掉文件路径和空实体
        if (entity && !entity.includes('/') && !entity.endsWith('.md')) {
          entities.add(entity);
        }
      }
    }

    return Array.from(entities);
  }

  /**
   * 生成实体页面内容
   */
  generateEntityPageContent(entityName: string): string {
    const now = new Date();
    const timeString = now.toISOString().slice(0, 16).replace('T', ' ');

    return `---
创建时间: ${timeString}
修改时间: ${timeString}
---

# ${entityName}

## 基本信息
- **类型**: 实体
- **创建时间**: ${timeString}

## 关联知识卡片

## 描述

`;
  }

  /**
   * 生成安全的文件名（替换非法字符）
   */
  getSafeFileName(name: string): string {
    // 移除空格
    let normalizedName = name.replace(/\s+/g, '');
    // 替换非法文件名字符
    normalizedName = normalizedName.replace(/[<>:"/\\|?*]/g, '_');
    return normalizedName;
  }
}
