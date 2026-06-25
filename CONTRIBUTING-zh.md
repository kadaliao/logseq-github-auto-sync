# 贡献指南

> 📖 **阅读**: [English](CONTRIBUTING.md) | [中文](CONTRIBUTING-zh.md)

感谢你对 GitHub Auto Sync 的兴趣！本指南提供了贡献说明和说明。

## 开发环境设置

### 前提条件

```bash
# 检查依赖
which age          # age 加密
which git          # Git
which git-lfs      # Git LFS（可选）
which rsync        # rsync

# 验证版本
age --version
git --version
git lfs version
```

### 克隆和设置

```bash
cd ~/logseq-github-auto-sync
npm install
npm test
```

### 项目结构

```
.
├── dist/                    # 构建的插件（由 Logseq 加载）
├── scripts/                 # CLI 工具
├── src/                     # 新模块化源代码（进行中）
│   ├── config/
│   ├── crypto/
│   ├── file/
│   ├── git/
│   └── scanner/
├── test/                    # 测试套件
└── README.md               # 用户文档
```

## 运行测试

```bash
# 所有测试
npm test

# 单独的测试文件
node test/sync-core.test.js
node test/sync-helper.test.js
node test/main-plugin-root.test.js
```

## 代码风格

**JavaScript**：
- 使用严格模式（`"use strict"`）
- 2 空格缩进
- 字符串使用单引号
- 必须使用分号
- 描述性变量名

**好**：
```javascript
function encryptFile(agePath, recipientsPath, inputFile, outputFile) {
  const tmpFile = `${outputFile}.age-tmp-${generateTempSuffix()}`;
  try {
    // ... 加密逻辑
  } catch (error) {
    cleanupTempFiles(tmpFile);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}
```

**差**：
```javascript
function enc(a,b,c,d){var t=c+".tmp";try{}catch(e){rm(t);throw"fail"}}
```

## 提交信息格式

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <description>

[可选正文]

[可选页脚]
```

**类型**：
- `feat`：新功能
- `fix`：Bug 修复
- `docs`：文档
- `test`：测试
- `refactor`：代码重构
- `perf`：性能改进
- `chore`：维护

**示例**：
```
fix: 防止加密失败时的临时文件泄露
feat: 添加多行敏感信息检测
docs: 添加架构图
test: 为 LFS 阈值边界情况添加测试
```

## 报告 Bug

### 报告前

1. **检查现有问题**：搜索 GitHub issues 查找类似报告
2. **更新到最新版本**：确保你在最新提交上
3. **重现**：尝试一致地重现 bug

### Bug 报告模板

```markdown
## 描述
Bug 的简要描述

## 重现步骤
1. 转到 '...'
2. 点击 '...'
3. 看到错误

## 预期行为
应该发生什么

## 实际行为
实际发生了什么

## 环境
- Logseq 版本: X.Y.Z
- 插件版本: 0.1.0
- 操作系统: macOS 14.0
- age 版本: X.Y.Z

## 日志
```
在此粘贴相关日志（删除敏感信息！）
```

## 截图
如果适用
```

## 功能请求

### 功能请求模板

```markdown
## 问题
这解决了什么问题？

## 解决方案
你打算如何实现它？

## 替代方案
你考虑过的其他方法

## 其他上下文
截图、模型等。
```

## Pull Request 流程

1. **更新文档**：
   - 如果面向用户，更新 README.md
   - 如果架构变更，更新 ARCHITECTURE.md

2. **确保测试通过**：
   ```bash
   npm test
   ```

3. **请求审查**：
   - 在 PR 中标记维护者
   - 对反馈积极响应

4. **合并**：
   - 维护者将在准备就绪时合并
   - 如果需要，压缩提交

## 安全

### 报告安全问题

**不要为安全漏洞公开提交 issue。**

发送邮件至：security@example.com（更新为实际联系方式）

包括：
- 漏洞描述
- 重现步骤
- 潜在影响
- 建议的修复（如果有）

### 安全准则

**绝不**：
- 提交私钥或敏感信息
- 未经讨论禁用敏感信息扫描
- 未经团队批准削弱加密

**始终**：
- 提交前扫描敏感信息
- 使用 `generateTempSuffix()` 生成临时文件
- 脱敏日志（使用 `redactGitOutput()`）
- 使用真实的 age 密钥测试（非虚拟数据）

## 问题？

- 打开 GitHub Discussion 进行一般性提问
- 加入 Logseq Discord 进行实时聊天
- 提问前先查看现有文档

## 许可证

通过贡献，你同意你的贡献将在 MIT 许可下发布。
