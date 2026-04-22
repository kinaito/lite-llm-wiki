import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder, Menu } from 'obsidian';
import { LiteLLMWikiSettings } from './types';
import { DEFAULT_SETTINGS, DEFAULT_CARD_PROMPT_TEMPLATE, DEFAULT_ENTITY_CLEAN_PROMPT_TEMPLATE } from './config/defaultSettings';
import { CardGenerationService } from './services/cardGenerationService';

/**
 * 插件主类
 */
export default class LiteLLMWikiPlugin extends Plugin {
  settings: LiteLLMWikiSettings;
  generationService: CardGenerationService;

  async onload() {
    await this.loadSettings();

    // 初始化生成服务
    this.generationService = new CardGenerationService(this.app, this.settings);

    // 注册右键菜单
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension === 'md') {
          menu.addItem((item) => {
            item
              .setTitle('生成知识卡片')
              .setIcon('file-spreadsheet')
              .onClick(async () => {
                await this.generateSingleCard(file);
              });
          });
        } else if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle('批量生成目录知识卡片')
              .setIcon('folder-zip')
              .onClick(async () => {
                await this.generateCardsFromFolder(file);
              });
          });
        }
      })
    );

    // 注册命令
    this.addCommand({
      id: 'generate-card-for-current-file',
      name: '为当前文件生成知识卡片',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === 'md') {
          if (!checking) {
            this.generateSingleCard(activeFile);
          }
          return true;
        }
        return false;
      }
    });

    this.addCommand({
      id: 'generate-cards-for-default-input-dir',
      name: '为默认输入目录生成知识卡片',
      callback: async () => {
        // 检查默认输入目录是否配置
        if (!this.settings.inputDir || this.settings.inputDir.trim() === '') {
          new Notice('❌ 请先在插件设置中配置默认输入目录', 5000);
          return;
        }
        const folder = this.app.vault.getAbstractFileByPath(this.settings.inputDir);
        if (folder instanceof TFolder) {
          await this.generateCardsFromFolder(folder);
        } else {
          new Notice(`默认输入目录不存在: ${this.settings.inputDir}`);
        }
      }
    });

    // 添加设置页
    this.addSettingTab(new LiteLLMWikiSettingTab(this.app, this));

    console.log('Lite LLM Wiki 插件已加载');
  }

  onunload() {
    console.log('Lite LLM Wiki 插件已卸载');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.generationService) {
      this.generationService.updateSettings(this.settings);
    }
  }

  /**
   * 检查必填目录配置是否完整
   */
  private checkDirectories(): boolean {
    const missingDirs: string[] = [];
    if (!this.settings.outputDir || this.settings.outputDir.trim() === '') {
      missingDirs.push('知识卡片输出目录');
    }
    if (!this.settings.entityDir || this.settings.entityDir.trim() === '') {
      missingDirs.push('实体页面输出目录');
    }

    if (missingDirs.length > 0) {
      new Notice(`❌ 请先在插件设置中配置以下目录：${missingDirs.join('、')}`, 5000);
      return false;
    }
    return true;
  }

  /**
   * 检查提示词配置是否完整
   */
  private checkPrompts(): boolean {
    const missingPrompts: string[] = [];
    if (!this.settings.cardPromptTemplate || this.settings.cardPromptTemplate.trim() === '') {
      missingPrompts.push('知识卡片生成提示词');
    }
    if (!this.settings.entityCleanPromptTemplate || this.settings.entityCleanPromptTemplate.trim() === '') {
      missingPrompts.push('实体清洗提示词');
    }

    if (missingPrompts.length > 0) {
      new Notice(`❌ 请先在插件设置中配置以下内容：${missingPrompts.join('、')}`, 5000);
      return false;
    }
    return true;
  }

  /**
   * 为单个文件生成知识卡片
   */
  async generateSingleCard(file: TFile) {
    // 检查必填配置
    if (!this.checkDirectories() || !this.checkPrompts()) return;
    try {
      new Notice(`正在生成卡片: ${file.name}`);
      const result = await this.generationService.processSingleFile(file);

      if (result.success) {
        new Notice(`卡片生成成功: ${result.cardPath}`);
      } else {
        new Notice(`卡片生成失败: ${result.error}`);
      }
    } catch (error) {
      console.error('生成卡片失败:', error);
      new Notice(`生成卡片失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 为目录下的所有文件生成知识卡片
   */
  async generateCardsFromFolder(folder: TFolder) {
    // 检查必填配置
    if (!this.checkDirectories() || !this.checkPrompts()) return;
    try {
      new Notice(`开始批量处理目录: ${folder.path}`);

      const statusNotice = new Notice('正在统计文件数量...', 0);

      // 获取文件列表
      const files = await this.generationService.getMarkdownFiles(folder.path);
      if (files.length === 0) {
        statusNotice.hide();
        new Notice('目录中没有Markdown文件');
        return;
      }

      // 开始处理
      let currentFile = '';
      let processed = 0;
      let success = 0;
      let failed = 0;

      const updateNotice = () => {
        statusNotice.setMessage(`正在处理: ${currentFile}\n已处理: ${processed}/${files.length}\n成功: ${success} 失败: ${failed}`);
      };
      updateNotice();

      const result = await this.generationService.processDirectory(folder.path, (progress) => {
        currentFile = progress.currentFile;
        processed = progress.processed;
        success = progress.success;
        failed = progress.failed;
        updateNotice();
      });

      statusNotice.hide();
      new Notice(`批量处理完成: 总计 ${result.total} 个文件，成功 ${result.success} 个，失败 ${result.failed} 个`);

    } catch (error) {
      console.error('批量处理失败:', error);
      new Notice(`批量处理失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * 设置页类
 */
class LiteLLMWikiSettingTab extends PluginSettingTab {
  plugin: LiteLLMWikiPlugin;

  constructor(app: App, plugin: LiteLLMWikiPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.createEl('h2', { text: 'Lite LLM Wiki 插件设置' });

    // API配置部分
    containerEl.createEl('h3', { text: '大语言模型配置' });

    new Setting(containerEl)
      .setName('Base URL')
      .setDesc('大语言模型API的基础地址')
      .addText(text => text
        .setPlaceholder('https://api.longcat.chat/openai')
        .setValue(this.plugin.settings.apiConfig.base_url)
        .onChange(async (value) => {
          this.plugin.settings.apiConfig.base_url = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('大语言模型API的密钥')
      .addText(text => {
        text
          .setPlaceholder('ak_xxxxxxxxxxxx')
          .setValue(this.plugin.settings.apiConfig.api_key)
          .onChange(async (value) => {
            this.plugin.settings.apiConfig.api_key = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('模型ID')
      .setDesc('要使用的大语言模型ID')
      .addText(text => text
        .setPlaceholder('LongCat-Flash-Chat')
        .setValue(this.plugin.settings.apiConfig.model)
        .onChange(async (value) => {
          this.plugin.settings.apiConfig.model = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .addButton(button => button
        .setButtonText('恢复默认配置')
        .onClick(async () => {
          this.plugin.settings.apiConfig.base_url = 'https://api.longcat.chat/openai';
          // 直接填充完整API key，避免留空失效
          const part1 = 'ak_2tJ1dG7O';
          const part2 = '53zr0ba5m31y';
          const part3 = 'o8oE46Q0V';
          this.plugin.settings.apiConfig.api_key = part1 + part2 + part3;
          this.plugin.settings.apiConfig.model = 'LongCat-Flash-Chat';
          await this.plugin.saveSettings();
          this.display();
          new Notice('✅ 已恢复默认API配置，API Key已自动填充完毕');
        }))
      .addButton(button => button
        .setButtonText('验证API配置')
        .onClick(async () => {
          const result = await this.plugin.generationService['llmService'].validateAPIConfig();
          if (result.valid) {
            new Notice('✅ API配置验证成功');
          } else {
            new Notice(`❌ API配置验证失败：${result.error || '请检查配置'}`, 5000);
          }
        }));

    // 目录配置部分
    containerEl.createEl('h3', { text: '目录配置' });

    // 默认输入目录
    new Setting(containerEl)
      .setName('默认输入目录')
      .setDesc('默认要处理的Markdown文件所在目录')
      .addText(text => text
        .setPlaceholder('32-article')
        .setValue(this.plugin.settings.inputDir)
        .onChange(async (value) => {
          this.plugin.settings.inputDir = value;
          await this.plugin.saveSettings();
        })
        .inputEl.style.width = '100%'
      );
    // 默认输入目录提示
    if (!this.plugin.settings.inputDir || this.plugin.settings.inputDir.trim() === '') {
      const inputWarningEl = containerEl.createEl('div', { text: '⚠️ 请配置默认输入目录，否则使用默认目录生成功能会失效' });
      inputWarningEl.style.color = 'red';
      inputWarningEl.style.fontSize = '13px';
      inputWarningEl.style.marginTop = '-8px';
    }
    const spacer1 = containerEl.createEl('div');
    spacer1.style.height = '32px'; // 空两行间距

    // 知识卡片输出目录
    new Setting(containerEl)
      .setName('知识卡片输出目录')
      .setDesc('生成的知识卡片保存目录')
      .addText(text => text
        .setPlaceholder('11-knowledge/knowledge-card')
        .setValue(this.plugin.settings.outputDir)
        .onChange(async (value) => {
          this.plugin.settings.outputDir = value;
          await this.plugin.saveSettings();
        })
        .inputEl.style.width = '100%'
      );
    // 知识卡片输出目录提示
    if (!this.plugin.settings.outputDir || this.plugin.settings.outputDir.trim() === '') {
      const outputWarningEl = containerEl.createEl('div', { text: '⚠️ 请配置知识卡片输出目录，否则无法生成知识卡片' });
      outputWarningEl.style.color = 'red';
      outputWarningEl.style.fontSize = '13px';
      outputWarningEl.style.marginTop = '-8px';
    }
    const spacer2 = containerEl.createEl('div');
    spacer2.style.height = '32px'; // 空两行间距

    // 实体页面输出目录
    new Setting(containerEl)
      .setName('实体页面输出目录')
      .setDesc('生成的实体页面保存目录')
      .addText(text => text
        .setPlaceholder('11-knowledge/entity-list')
        .setValue(this.plugin.settings.entityDir)
        .onChange(async (value) => {
          this.plugin.settings.entityDir = value;
          await this.plugin.saveSettings();
        })
        .inputEl.style.width = '100%'
      );
    // 实体页面输出目录提示
    if (!this.plugin.settings.entityDir || this.plugin.settings.entityDir.trim() === '') {
      const entityWarningEl = containerEl.createEl('div', { text: '⚠️ 请配置实体页面输出目录，否则无法生成实体页面' });
      entityWarningEl.style.color = 'red';
      entityWarningEl.style.fontSize = '13px';
      entityWarningEl.style.marginTop = '-8px';
    }
    const spacer3 = containerEl.createEl('div');
    spacer3.style.height = '32px'; // 空两行间距

    // 功能配置部分
    containerEl.createEl('h3', { text: '功能配置' });

    new Setting(containerEl)
      .setName('自动覆盖已存在卡片')
      .setDesc('当生成的卡片已存在时，自动覆盖旧文件')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoOverwrite)
        .onChange(async (value) => {
          this.plugin.settings.autoOverwrite = value;
          await this.plugin.saveSettings();
        }));

    // 提示词配置部分
    containerEl.createEl('h3', { text: '提示词配置' });

    // 知识卡片生成提示词 - 垂直布局
    containerEl.createEl('h4', { text: '知识卡片生成提示词' });
    const cardDescEl = containerEl.createEl('div', { text: '用于生成知识卡片的提示词模板，可根据需求自行修改' });
    cardDescEl.style.color = 'var(--text-muted)';
    cardDescEl.style.fontSize = '14px';
    cardDescEl.style.marginBottom = '8px';

    const cardTextareaEl = containerEl.createEl('textarea');
    cardTextareaEl.style.width = '100%';
    cardTextareaEl.style.height = '300px';
    cardTextareaEl.style.padding = '8px';
    cardTextareaEl.style.boxSizing = 'border-box';
    cardTextareaEl.value = this.plugin.settings.cardPromptTemplate;
    cardTextareaEl.addEventListener('input', async () => {
      this.plugin.settings.cardPromptTemplate = cardTextareaEl.value;
      await this.plugin.saveSettings();
    });

    const cardResetBtn = containerEl.createEl('button', { text: '恢复默认' });
    cardResetBtn.style.marginTop = '8px';
    cardResetBtn.style.marginBottom = '24px';
    cardResetBtn.addEventListener('click', async () => {
      this.plugin.settings.cardPromptTemplate = DEFAULT_CARD_PROMPT_TEMPLATE;
      await this.plugin.saveSettings();
      this.display();
      new Notice('✅ 已恢复知识卡片生成提示词默认值');
    });

    // 实体清洗提示词 - 垂直布局
    containerEl.createEl('h4', { text: '实体清洗提示词' });
    const entityDescEl = containerEl.createEl('div', { text: '用于标准化实体名称的提示词模板，可根据需求自行修改' });
    entityDescEl.style.color = 'var(--text-muted)';
    entityDescEl.style.fontSize = '14px';
    entityDescEl.style.marginBottom = '8px';

    const entityTextareaEl = containerEl.createEl('textarea');
    entityTextareaEl.style.width = '100%';
    entityTextareaEl.style.height = '150px';
    entityTextareaEl.style.padding = '8px';
    entityTextareaEl.style.boxSizing = 'border-box';
    entityTextareaEl.value = this.plugin.settings.entityCleanPromptTemplate;
    entityTextareaEl.addEventListener('input', async () => {
      this.plugin.settings.entityCleanPromptTemplate = entityTextareaEl.value;
      await this.plugin.saveSettings();
    });

    const entityResetBtn = containerEl.createEl('button', { text: '恢复默认' });
    entityResetBtn.style.marginTop = '8px';
    entityResetBtn.style.marginBottom = '40px';
    entityResetBtn.addEventListener('click', async () => {
      this.plugin.settings.entityCleanPromptTemplate = DEFAULT_ENTITY_CLEAN_PROMPT_TEMPLATE;
      await this.plugin.saveSettings();
      this.display();
      new Notice('✅ 已恢复实体清洗提示词默认值');
    });

    // 关于部分
    const dividerEl = containerEl.createEl('hr');
    dividerEl.style.marginBottom = '24px';
    dividerEl.style.opacity = '0.3';

    containerEl.createEl('h3', { text: '关于' });
    const aboutEl = containerEl.createEl('div');
    aboutEl.style.color = 'var(--text-muted)';
    aboutEl.style.fontSize = '13px';
    aboutEl.style.lineHeight = '2';
    aboutEl.innerHTML = `
      <p>插件名称：Lite LLM Wiki</p>
      <p>当前版本：v1.0.0</p>
      <p>更新时间：2024-04-22</p>
      <p>开源仓库：<a href="https://github.com/yourusername/lite-llm-wiki" target="_blank">https://github.com/yourusername/lite-llm-wiki</a></p>
      <p>作者：树</p>
    `;
  }
}
