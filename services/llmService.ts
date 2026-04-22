import { request } from 'obsidian';
import { APIConfig, KnowledgeCard } from '../types';
import { DEFAULT_CARD_PROMPT_TEMPLATE, DEFAULT_ENTITY_CLEAN_PROMPT_TEMPLATE } from '../config/defaultSettings';

/**
 * LLM服务类
 * 负责所有与大语言模型的交互逻辑
 */
export class LLMService {
  private apiConfig: APIConfig;
  // 解密密钥，内置在代码中，不会对外暴露
  private readonly decryptKey = 'lite-llm-wiki-2026-v1';

  constructor(apiConfig: APIConfig) {
    // 如果用户没有设置API key，使用内置的默认key
    if (!apiConfig.api_key || apiConfig.api_key.trim() === '') {
      // 分段拼接避免明文泄露
      const part1 = 'ak_2tJ1dG7O';
      const part2 = '53zr0ba5m31y';
      const part3 = 'o8oE46Q0V';
      apiConfig.api_key = part1 + part2 + part3;
    }
    this.apiConfig = apiConfig;
  }

  /**
   * 更新API配置
   */
  updateConfig(apiConfig: APIConfig): void {
    // 双保险：如果API key为空，自动填充内置默认值
    if (!apiConfig.api_key || apiConfig.api_key.trim() === '') {
      const part1 = 'ak_2tJ1dG7O';
      const part2 = '53zr0ba5m31y';
      const part3 = 'o8oE46Q0V';
      apiConfig.api_key = part1 + part2 + part3;
    }
    this.apiConfig = apiConfig;
  }

  /**
   * 调用LLM API
   */
  private async callAPI(prompt: string): Promise<string | null> {
    try {
      const payload = {
        model: this.apiConfig.model,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.1
      };

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiConfig.api_key}`
      };

      const response = await request({
        url: `${this.apiConfig.base_url}/v1/chat/completions`,
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        timeout: 60000
      });

      const result = JSON.parse(response);
      return result.choices[0].message.content;
    } catch (error) {
      console.error('LLM API调用失败:', error);
      return null;
    }
  }

  /**
   * 生成知识卡片
   */
  async generateKnowledgeCard(
    content: string,
    originalFilename: string,
    existingEntities: string[] = [],
    customPrompt?: string
  ): Promise<string | null> {
    let promptTemplate = customPrompt || DEFAULT_CARD_PROMPT_TEMPLATE;

    // 注入已有实体库上下文，要求优先使用标准名称
    if (existingEntities.length > 0) {
      const entitiesList = existingEntities.join('", "');
      const entityRule = `\n\n### 已有实体库规则（强制遵守）
当前已存在的标准实体库：["${entitiesList}"]。
如果文中提到的实体在概念上等同于库中的实体，必须严格使用库中的标准名称，禁止生成同义词或不同写法。
如果是库中不存在的新实体，使用符合实体命名协议的名称。`;

      // 把规则插入到实体命名协议后面
      promptTemplate = promptTemplate.replace(
        "### 实体命名协议 (Naming Protocol) - 强制执行",
        `### 实体命名协议 (Naming Protocol) - 强制执行${entityRule}`
      );
    }

    let prompt = promptTemplate.replace('{content}', content);
    prompt = prompt.replace(
      "[[此处仅填入原文件的文件名，必须带扩展名，包裹在双中括号内]]",
      `[[${originalFilename}]]`
    );

    return this.callAPI(prompt);
  }

  /**
   * 清洗实体列表
   */
  async cleanEntities(entities: string[], customPrompt?: string): Promise<string[]> {
    if (entities.length === 0) return [];

    const promptTemplate = customPrompt || DEFAULT_ENTITY_CLEAN_PROMPT_TEMPLATE;
    const prompt = promptTemplate.replace('{entities}', JSON.stringify(entities));

    const result = await this.callAPI(prompt);
    if (!result) return entities;

    try {
      // 尝试解析JSON结果
      const cleanedEntities = JSON.parse(result);
      return Array.isArray(cleanedEntities) ? cleanedEntities : entities;
    } catch (error) {
      console.error('实体清洗结果解析失败:', error);
      return entities;
    }
  }

  /**
   * 验证API配置是否有效
   */
  async validateAPIConfig(): Promise<{valid: boolean, error?: string}> {
    try {
      const payload = {
        model: this.apiConfig.model,
        messages: [
          { role: 'user', content: '测试API连接' }
        ],
        temperature: 0.7
      };

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiConfig.api_key}`
      };

      await request({
        url: `${this.apiConfig.base_url}/v1/chat/completions`,
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        timeout: 30000
      });

      return { valid: true };
    } catch (error: any) {
      console.error('API配置验证失败:', error);
      let errorMsg = '未知错误';
      if (error.response) {
        try {
          const responseBody = JSON.parse(error.response);
          errorMsg = responseBody.error?.message || JSON.stringify(responseBody);
        } catch {
          errorMsg = error.response;
        }
      } else if (error.status) {
        errorMsg = `HTTP ${error.status}`;
        if (error.status === 401) errorMsg += '（API密钥无效）';
        if (error.status === 404) errorMsg += '（API地址错误）';
        if (error.status === 429) errorMsg += '（请求频率超限/额度不足）';
        if (error.status === 500) errorMsg += '（服务器内部错误）';
      } else if (error.message) {
        errorMsg = error.message;
      }
      return { valid: false, error: errorMsg };
    }
  }
}
