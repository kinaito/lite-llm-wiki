import { App, TFile } from 'obsidian';
import * as CryptoJS from 'crypto-js';
import { GenerationRecord, LiteLLMWikiSettings } from '../types';

/**
 * 生成记录管理服务
 * 负责管理原文件和生成卡片之间的关联关系
 */
export class GenerationRecordService {
  private app: App;
  private settings: LiteLLMWikiSettings;
  private records: GenerationRecord[] = [];

  constructor(app: App, settings: LiteLLMWikiSettings) {
    this.app = app;
    this.settings = settings;
    // 从配置中加载历史记录
    this.loadRecords();
  }

  /**
   * 从配置加载记录
   */
  private loadRecords(): void {
    // @ts-ignore - 扩展settings存储记录
    this.records = this.settings.generationRecords || [];
  }

  /**
   * 保存记录到配置
   */
  async saveRecords(): Promise<void> {
    // @ts-ignore - 扩展settings存储记录
    this.settings.generationRecords = this.records;
    // 这里需要外部调用plugin.saveSettings()来持久化
  }

  /**
   * 计算文件内容的MD5哈希
   */
  async calculateFileHash(file: TFile): Promise<string> {
    const content = await this.app.vault.read(file);
    return CryptoJS.MD5(content).toString();
  }

  /**
   * 计算两个文本的相似度（0-1，越大越相似）
   * 简单实现：基于共同字符比例
   */
  calculateContentSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 1;
    if (!text1 || !text2) return 0;

    const set1 = new Set(text1.split(''));
    const set2 = new Set(text2.split(''));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * 添加新的生成记录
   */
  addRecord(record: Omit<GenerationRecord, 'id' | 'generatedAt'>): GenerationRecord {
    const newRecord: GenerationRecord = {
      ...record,
      id: CryptoJS.MD5(`${record.originalFilePath}_${Date.now()}`).toString(),
      generatedAt: Date.now()
    };

    // 先删除同一个原文件的旧记录
    this.records = this.records.filter(r => r.originalFilePath !== record.originalFilePath);
    this.records.push(newRecord);

    return newRecord;
  }

  /**
   * 根据原文件路径查询记录
   */
  getRecordByOriginalPath(originalFilePath: string): GenerationRecord | undefined {
    return this.records.find(r => r.originalFilePath === originalFilePath);
  }

  /**
   * 根据卡片路径查询记录
   */
  getRecordByCardPath(cardFilePath: string): GenerationRecord | undefined {
    return this.records.find(r => r.cardFilePath === cardFilePath);
  }

  /**
   * 根据卡片名称查询所有同名卡片记录（用于冲突检测）
   */
  getRecordsByCardName(cardName: string): GenerationRecord[] {
    return this.records.filter(r => {
      const fileName = r.cardFilePath.split('/').pop() || '';
      return fileName === `${cardName}.md` || fileName.startsWith(`${cardName} (`);
    });
  }

  /**
   * 删除记录
   */
  deleteRecord(originalFilePath: string): void {
    this.records = this.records.filter(r => r.originalFilePath !== originalFilePath);
  }

  /**
   * 检查原文件是否已经生成过卡片且内容未修改
   */
  async isFileUnchanged(file: TFile): Promise<boolean> {
    const record = this.getRecordByOriginalPath(file.path);
    if (!record) return false;

    const currentHash = await this.calculateFileHash(file);
    return currentHash === record.originalFileHash;
  }

  /**
   * 检查生成的卡片是否被用户手动修改过
   */
  async isCardManuallyModified(record: GenerationRecord): Promise<boolean> {
    const cardFile = this.app.vault.getAbstractFileByPath(record.cardFilePath);
    if (!(cardFile instanceof TFile)) return false;

    // 比较卡片的修改时间和生成时间
    // 如果修改时间比生成时间晚超过10秒，说明被手动修改过
    if (cardFile.stat.mtime > record.generatedAt + 10000) {
      // 双重验证：对比卡片内容哈希（可选，避免误判）
      // 这里简化处理，只通过时间判断
      return true;
    }

    return false;
  }

  /**
   * 获取所有记录
   */
  getAllRecords(): GenerationRecord[] {
    return [...this.records];
  }

  /**
   * 清理无效记录（卡片文件已经不存在的记录）
   */
  async cleanupInvalidRecords(): Promise<number> {
    const validRecords: GenerationRecord[] = [];
    let deletedCount = 0;

    for (const record of this.records) {
      const cardFile = this.app.vault.getAbstractFileByPath(record.cardFilePath);
      if (cardFile instanceof TFile) {
        validRecords.push(record);
      } else {
        deletedCount++;
      }
    }

    this.records = validRecords;
    return deletedCount;
  }
}
