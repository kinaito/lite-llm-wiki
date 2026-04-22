/**
 * API配置接口
 */
export interface APIConfig {
  base_url: string;
  api_key: string;
  model: string;
}

/**
 * 插件配置接口
 */
export interface LiteLLMWikiSettings {
  // API配置
  apiConfig: APIConfig;

  // 目录配置
  inputDir: string;
  outputDir: string;
  entityDir: string;

  // 提示词配置
  cardPromptTemplate: string;
  entityCleanPromptTemplate: string;

  // 功能配置
  autoOverwrite: boolean;
}

/**
 * 知识卡片数据接口
 */
export interface KnowledgeCard {
  卡片名称: string;
  核心定义: string;
  关键要点: string[];
  作者情绪: string;
  关联实体: string;
  原文地址: string;
}

/**
 * 生成记录接口
 */
export interface GenerationRecord {
  id: string;
  timestamp: number;
  originalFilePath: string;
  originalFileName: string;
  cardFilePath: string;
  cardFileName: string;
  entityFilePaths: string[];
  status: 'success' | 'failed';
  errorMessage?: string;
  promptVersion: string;
}

/**
 * 实体关联关系
 */
export interface EntityRelation {
  entityName: string;
  cardPaths: string[];
  lastUpdated: number;
}

/**
 * 生成任务进度
 */
export interface GenerationProgress {
  total: number;
  processed: number;
  success: number;
  failed: number;
  currentFile: string;
}

/**
 * 生成记录接口
 * 记录原文件和生成卡片之间的关联关系
 */
export interface GenerationRecord {
  id: string; // 唯一ID
  originalFilePath: string; // 原文件完整路径
  originalFileHash: string; // 原文件内容MD5哈希
  cardFilePath: string; // 生成的卡片文件路径
  generatedAt: number; // 生成时间戳
  entities: string[]; // 关联的实体列表
  lastModifiedAt?: number; // 卡片最后修改时间（用于检测用户手动修改）
}

/**
 * 文件冲突类型
 */
export enum ConflictType {
  MANUALLY_MODIFIED = 'manually_modified', // 卡片被用户手动修改
  DUPLICATE_NAME = 'duplicate_name', // 同名卡片冲突
  CONTENT_SIMILAR = 'content_similar' // 内容相似的同名卡片
}

/**
 * 冲突处理结果
 */
export interface ConflictResolution {
  type: ConflictType;
  filePath: string;
  action: 'overwrite' | 'skip' | 'merge' | 'new_version';
}

