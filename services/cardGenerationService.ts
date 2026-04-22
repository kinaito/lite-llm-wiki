import { App, TFile, TFolder, Notice } from 'obsidian';
import { LiteLLMWikiSettings, GenerationProgress, KnowledgeCard, GenerationRecord } from '../types';
import { LLMService } from './llmService';
import { CardParserService } from './cardParserService';
import { GenerationRecordService } from './generationRecordService';

/**
 * 卡片生成服务类
 * 负责整个知识卡片生成流程的协调
 */
export class CardGenerationService {
  private app: App;
  private settings: LiteLLMWikiSettings;
  private llmService: LLMService;
  private parserService: CardParserService;
  private recordService: GenerationRecordService;

  constructor(app: App, settings: LiteLLMWikiSettings) {
    this.app = app;
    this.settings = settings;
    this.llmService = new LLMService(settings.apiConfig);
    this.parserService = new CardParserService();
    this.recordService = new GenerationRecordService(app, settings);
  }

  /**
   * 更新配置
   */
  updateSettings(settings: LiteLLMWikiSettings): void {
    this.settings = settings;
    this.llmService.updateConfig(settings.apiConfig);
  }

  /**
   * 获取目录下的所有Markdown文件
   */
  async getMarkdownFiles(directoryPath: string): Promise<TFile[]> {
    const folder = this.app.vault.getAbstractFileByPath(directoryPath);
    if (!folder || !(folder instanceof TFolder)) {
      throw new Error(`目录不存在: ${directoryPath}`);
    }

    const markdownFiles: TFile[] = [];
    const scanFolder = async (currentFolder: TFolder) => {
      for (const child of currentFolder.children) {
        if (child instanceof TFile && child.extension === 'md') {
          markdownFiles.push(child);
        } else if (child instanceof TFolder) {
          await scanFolder(child);
        }
      }
    };

    await scanFolder(folder);
    return markdownFiles;
  }

  /**
   * 确保目录存在，不存在则创建
   */
  private async ensureDirectoryExists(directoryPath: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(directoryPath);
    if (!folder || !(folder instanceof TFolder)) {
      await this.app.vault.createFolder(directoryPath);
      new Notice(`已创建目录: ${directoryPath}`);
    }
  }

  /**
   * 获取记录服务（外部用于保存记录）
   */
  getRecordService(): GenerationRecordService {
    return this.recordService;
  }

  /**
   * 处理单个文件生成卡片
   */
  async processSingleFile(
    file: TFile,
    progressCallback?: (progress: GenerationProgress) => void,
    forceRegenerate: boolean = false // 是否强制重新生成，跳过未修改检查
  ): Promise<{
    success: boolean;
    skipped?: boolean;
    skippedReason?: string;
    cardPath?: string;
    entities?: string[];
    error?: string;
    oldRecord?: GenerationRecord;
    newRecord?: GenerationRecord;
  }> {
    try {
      // 1. 检查文件是否已经生成过且内容未修改
      if (!forceRegenerate) {
        const isUnchanged = await this.recordService.isFileUnchanged(file);
        if (isUnchanged) {
          return {
            success: true,
            skipped: true,
            skippedReason: '文件内容未修改，已跳过生成'
          };
        }
      }

      // 2. 查询旧的生成记录
      const oldRecord = this.recordService.getRecordByOriginalPath(file.path);

      // 3. 读取文件内容，计算哈希
      const content = await this.app.vault.read(file);
      const fileHash = await this.recordService.calculateFileHash(file);

      // 4. 调用LLM生成卡片，传入已有实体列表
      const existingEntities = await this.getExistingEntities();
      const cardContent = await this.llmService.generateKnowledgeCard(
        content,
        file.name,
        existingEntities,
        this.settings.cardPromptTemplate
      );

      if (!cardContent) {
        return { success: false, error: 'LLM生成卡片失败' };
      }

      // 5. 解析卡片内容
      const cardData = this.parserService.parseCardContent(cardContent);

      // 6. 生成输出文件名和路径，使用固定cardId作为文件名，与标题解耦
      const cardId = `Card_${fileHash.slice(0, 8)}`;
      const cardFileName = `${cardId}.md`;
      const cardFilePath = `${this.settings.outputDir}/${cardFileName}`;
      // 因为cardId是基于原文件MD5生成的，同一个原文件cardId永远相同，不会出现同名冲突
      // 不同原文件生成相同cardId的概率可以忽略不计（MD5前8位碰撞概率极低）

      // 7. 确保输出目录存在
      await this.ensureDirectoryExists(this.settings.outputDir);

      // 8. 删除旧卡片（如果有）
      if (oldRecord) {
        const oldCardFile = this.app.vault.getAbstractFileByPath(oldRecord.cardFilePath);
        if (oldCardFile instanceof TFile) {
          await this.app.vault.delete(oldCardFile);
          new Notice(`已删除旧卡片: ${oldRecord.cardFilePath}`);
        }
        // 删除旧记录
        this.recordService.deleteRecord(file.path);
      }

      // 9. 转换为Markdown格式并保存新卡片
      const markdownContent = this.parserService.cardToMarkdown(
        cardData,
        cardId,
        file.path,
        fileHash
      );
      const existingNewFile = this.app.vault.getAbstractFileByPath(cardFilePath);
      if (existingNewFile instanceof TFile) {
        await this.app.vault.modify(existingNewFile, markdownContent);
      } else {
        await this.app.vault.create(cardFilePath, markdownContent);
      }

      // 10. 提取实体
      const entities = this.parserService.extractEntitiesFromContent(markdownContent);

      // 11. 如果配置了自动提取实体，创建实体页面
      let createdEntities: string[] = [];
      if (this.settings.autoExtractEntities && entities.length > 0) {
        createdEntities = await this.createEntityPages(entities);
      }

      // 12. 保存新的生成记录
      const newRecord = this.recordService.addRecord({
        originalFilePath: file.path,
        originalFileHash: fileHash,
        cardFilePath: cardFilePath,
        entities: createdEntities
      });

      // 13. 增加使用计数
      await this.incrementUsageCount();

      return {
        success: true,
        skipped: false,
        cardPath: cardFilePath,
        entities: createdEntities,
        oldRecord,
        newRecord
      };
    } catch (error) {
      console.error(`处理文件失败 ${file.name}:`, error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 批量处理目录下的所有文件
   */
  async processDirectory(
    directoryPath: string,
    progressCallback?: (progress: GenerationProgress) => void,
    forceRegenerate: boolean = false // 是否强制重新生成所有文件
  ): Promise<{ success: number; failed: number; skipped: number; total: number }> {
    try {
      const files = await this.getMarkdownFiles(directoryPath);
      const total = files.length;
      let processed = 0;
      let success = 0;
      let failed = 0;
      let skipped = 0;

      // 报告初始进度
      if (progressCallback) {
        progressCallback({
          total,
          processed: 0,
          success: 0,
          failed: 0,
          currentFile: ''
        });
      }

      for (const file of files) {
        processed++;
        if (progressCallback) {
          progressCallback({
            total,
            processed,
            success,
            failed,
            currentFile: file.name
          });
        }

        const result = await this.processSingleFile(file, undefined, forceRegenerate);
        if (result.skipped) {
          skipped++;
        } else if (result.success) {
          success++;
        } else {
          failed++;
        }

        // 避免API速率限制
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 报告最终进度
      if (progressCallback) {
        progressCallback({
          total,
          processed,
          success,
          failed,
          currentFile: ''
        });
      }

      return { success, failed, skipped, total };
    } catch (error) {
      console.error('批量处理失败:', error);
      throw error;
    }
  }

  /**
   * 创建实体页面
   */
  async createEntityPages(entities: string[]): Promise<string[]> {
    if (entities.length === 0) return [];

    // 清洗实体
    const cleanedEntities = await this.llmService.cleanEntities(
      entities,
      this.settings.entityCleanPromptTemplate
    );

    // 确保实体目录存在
    await this.ensureDirectoryExists(this.settings.entityDir);

    const createdEntities: string[] = [];
    for (const entity of cleanedEntities) {
      try {
        const safeEntityName = this.parserService.getSafeFileName(entity);
        const entityFilePath = `${this.settings.entityDir}/${safeEntityName}.md`;

        // 检查实体页面是否已存在
        const existingFile = this.app.vault.getAbstractFileByPath(entityFilePath);
        if (!existingFile) {
          const content = this.parserService.generateEntityPageContent(entity);
          await this.app.vault.create(entityFilePath, content);
          createdEntities.push(entity);
        }
      } catch (error) {
        console.error(`创建实体页面失败 ${entity}:`, error);
      }
    }

    return createdEntities;
  }

  /**
   * 增加今日使用计数
   */
  private async incrementUsageCount(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    // 如果是新的一天，重置计数
    if (this.settings.lastResetDate !== today) {
      this.settings.todayUsageCount = 0;
      this.settings.lastResetDate = today;
    }

    this.settings.todayUsageCount++;
  }

  /**
   * 获取所有已存在的实体名
   */
  private async getExistingEntities(): Promise<string[]> {
    try {
      const entityFolder = this.app.vault.getAbstractFileByPath(this.settings.entityDir);
      if (!entityFolder || !(entityFolder instanceof TFolder)) {
        return [];
      }

      const entities: string[] = [];
      const scanFolder = async (folder: TFolder) => {
        for (const child of folder.children) {
          if (child instanceof TFile && child.extension === 'md') {
            // 去掉.md后缀作为实体名
            const entityName = child.basename;
            entities.push(entityName);
          } else if (child instanceof TFolder) {
            await scanFolder(child);
          }
        }
      };

      await scanFolder(entityFolder);
      return entities;
    } catch (e) {
      console.error('读取实体列表失败', e);
      return [];
    }
  }

  /**
   * 检查是否达到今日免费限额
   */
  checkDailyLimit(): { limited: boolean; remaining: number; used: number } {
    const today = new Date().toISOString().split('T')[0];
    if (this.settings.lastResetDate !== today) {
      return { limited: false, remaining: this.settings.freeDailyLimit, used: 0 };
    }

    const remaining = this.settings.freeDailyLimit - this.settings.todayUsageCount;
    return {
      limited: remaining <= 0,
      remaining: Math.max(0, remaining),
      used: this.settings.todayUsageCount
    };
  }
}
