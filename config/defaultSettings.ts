import { LiteLLMWikiSettings } from '../types';

/**
 * 默认卡片生成提示词模板
 */
export const DEFAULT_CARD_PROMPT_TEMPLATE = `# Role
你是一个资深的"语义解析与知识重构专家"。你的任务是忽略原始文本中的一切排版干扰和冗余信息，将其转化为高密度的、纯文字的原子化知识卡片。

# Rules (底层处理逻辑)
1. **字符级过滤**：严禁在输出中包含任何非文字的视觉装饰符号（禁止所有 Emoji、图标、ASCII 装饰线）。
2. **列表化输出**：【关键要点】必须使用 Markdown 无序列表（* 或 -）呈现。每行仅承载一个独立逻辑点，禁止将多个要点合并为段落。
3. **结构化去噪**：自动忽略 HTML 标签、元数据、社交媒体引导语等噪声。
4. **代码语义化**：遇到代码或指令，禁止展示源码，必须转译为其"实现的功能"或"核心逻辑"。
5. **输出规格**：全中文，纯文字，总字数 < 300 字。严禁输出任何引导性开场白。

# 实体命名协议 (Naming Protocol) - 强制执行
1. **去空格化**：专有名词中间严禁保留空格。例如：使用 \`OpenClaw\` 而非 \`Open Claw\`，使用 \`PyAutoGUI\` 而非 \`PyAuto GUI\`。
2. **大小写规范**：技术缩写必须全大写（如 \`OCR\`, \`RPA\`, \`API\`）；普通专有名词使用首字母大写（如 \`Obsidian\`, \`Python\`）。
3. **术语唯一性**：若原文存在公认的英文术语，**仅输出英文**，禁止中英混写或仅输出中文（例如：使用 \`Agent\` 而非 \`智能体\`）。
4. **去复数与去符号**：实体名必须使用单数形式，严禁包含 \`/\`, \`\\\\\`, \`-\`, \`_\` 等连接符。

# Workflow
1. **语义解构**：从原始文本中提取核心信息。
2. **文件名安全命名**：拟定 20 字以内学术化标题。**禁止包含：/ \\ : * ? " < > |**。
3. **关系建模**：依据【实体命名协议】提取专业名词，并执行双向链接。

# Output Format (严格执行)
必须且仅能输出以下结构，禁止包含任何 Emoji：

【卡片名称】：[生成的纯文字标题，将作为文件名使用]
【核心定义】：[一句话定义本质，严禁废话引导语]
【关键要点】：
* [高浓度事实 1]
* [高浓度事实 2]
* [高浓度事实 3]
* [高浓度事实 4]
【作者情绪】：[精准提炼立场或倾向]
【关联实体】：[[实体1]], [[实体2]]
【原文地址】：[[此处仅填入原文件的文件名，必须带扩展名，包裹在双中括号内]]

原文内容：
{content}
`;

/**
 * 默认实体清洗提示词模板
 */
export const DEFAULT_ENTITY_CLEAN_PROMPT_TEMPLATE = `你现在的任务是"实体库标准化审计"。
以下是从知识卡片中提取的原始实体列表：
{entities}

请根据以下协议进行清洗：
1. 合并同义词：例如将 "AI代理" 和 "Agent" 统一为 "Agent"。
2. 修正格式：移除空格，统一大小写（缩写全大写，专有名词首字母大写）。
3. 语义去重：确保列表中没有重复含义的词。

仅输出 JSON 格式的字符串数组，例如：["Agent", "OCR", "Obsidian"]
`;

/**
 * 默认配置
 */
export const DEFAULT_SETTINGS: LiteLLMWikiSettings = {
  apiConfig: {
    base_url: 'https://api.longcat.chat/openai',
    api_key: '', // 默认API key内置在代码中，自动加载
    model: 'LongCat-Flash-Chat'
  },

  inputDir: '32-article',
  outputDir: '11-knowledge/knowledge-card',
  entityDir: '11-knowledge/entity-list',

  cardPromptTemplate: DEFAULT_CARD_PROMPT_TEMPLATE,
  entityCleanPromptTemplate: DEFAULT_ENTITY_CLEAN_PROMPT_TEMPLATE,

  autoOverwrite: true
};
