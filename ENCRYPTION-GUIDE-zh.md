# GitHub Auto Sync - 加密与密钥管理指南

> 📖 **阅读**: [English](ENCRYPTION-GUIDE.md) | [中文](ENCRYPTION-GUIDE-zh.md)

**版本**: 0.2.0
**更新日期**: 2026-06-25
**作者**: Kada Liao (kadaliao@gmail.com)

---

## 目录

- [一、核心概念（30 秒理解）](#一核心概念30-秒理解)
- [二、需要管理的文件](#二需要管理的文件)
- [三、首次设置（5 分钟）](#三首次设置5-分钟)
- [四、多台电脑同步](#四多台电脑同步)
- [五、丢失密钥的后果](#五丢失密钥的后果)
- [六、备份策略](#六备份策略)
- [七、团队协作](#七团队协作)
- [八、常见问题](#八常见问题)
- [九、快速参考](#九快速参考)
- [十、核心原则](#十核心原则)
- [十一、紧急情况处理](#十一紧急情况处理)

---

## 一、核心概念（30 秒理解）

### 什么是加密？

> **加密 = 用"公开的锁"锁住文件，只有你有"唯一的钥匙"能打开**

**现实类比：**
- 🔒 **公钥 (recipients.txt)** = 你可以给别人的锁
- 🔑 **私钥 (identity.txt)** = 只有你能用的钥匙
- 📦 **加密文件** = 用锁锁住的保险箱

**核心原则：**
- 公钥可以随便分享（锁给别人也没关系）
- 私钥绝对不能泄露（钥匙丢了就打不开保险箱）
- 没有私钥 = 文件永久丢失（数学上无法破解）

> **English**: Encryption is like locking files with a "public lock" that only you can open with a "unique key".
> - Public Key (recipients.txt) = A lock you can give to others
> - Private Key (identity.txt) = The only key that can open that lock
> - Without the private key = Permanent data loss (mathematically impossible to crack)

---

## 二、需要管理的文件

### 文件清单（仅 2 个）

```
~/.config/logseq-github-auto-sync/
├── identity.txt      ← 🔑 私钥（必须备份！绝对不能泄露！）
└── recipients.txt    ← 🔒 公钥（可以分享，无风险）
```

### identity.txt（私钥）

**是什么：**
- 你的私人密钥
- 解密加密文件的唯一方法
- 文件内容示例：
  ```
  AGE-SECRET-KEY-1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
  ```

**存放位置（默认）：**
```bash
~/.config/logseq-github-auto-sync/identity.txt
# 完整路径：/Users/你的用户名/.config/logseq-github-auto-sync/identity.txt
```

**你需要做什么：**
1. ✅ **生成一次**（30 秒）
2. ✅ **备份一次**（1 分钟）
3. ✅ **再也不用管**（插件自动使用）

**绝对禁止：**
- ❌ 不能传到 GitHub
- ❌ 不能粘贴到 Logseq 笔记
- ❌ 不能通过微信/邮件发送
- ❌ 不能放在桌面/Downloads 等公开位置

> **English**: identity.txt is your private key, the only way to decrypt files. Generate it once, backup once, and never touch it again. The plugin uses it automatically.

### recipients.txt（公钥）

**是什么：**
- 公开的加密密钥
- 用于加密文件，不能解密
- 可以安全分享

**你需要做什么：**
- ✅ 啥也不用做（插件自动使用）
- ✅ 如果想和团队共享，可以收集所有人的 recipients.txt

> **English**: recipients.txt is the public key used for encryption. It can be regenerated from identity.txt anytime, so no backup needed.

---

## 三、首次设置（5 分钟）

### 步骤 1：生成密钥对

```bash
# 创建目录
mkdir -p ~/.config/logseq-github-auto-sync
chmod 700 ~/.config/logseq-github-auto-sync

# 生成私钥（保存在 identity.txt）
umask 077
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt

# 生成公钥（保存在 recipients.txt）
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

# 设置权限
chmod 600 ~/.config/logseq-github-auto-sync/identity.txt
chmod 644 ~/.config/logseq-github-auto-sync/recipients.txt
```

> **English**: 
> - `umask 077` ensures strict file permissions
> - `chmod 600` = Only you can read/write identity.txt
> - `chmod 644` = Everyone can read recipients.txt (no risk)

### 步骤 2：立即备份 identity.txt

**推荐方案（按优先级）：**

1. **密码管理器**（最推荐）
   - 1Password / Bitwarden / KeePassXC
   - 创建安全笔记，粘贴 identity.txt 内容

2. **离线存储**
   - U 盘 / 移动硬盘
   - 加密压缩包：`zip -e identity-backup.zip identity.txt`

3. **云端加密**（备选）
   - iCloud / Dropbox（仅加密压缩包）

> **English**: Backup immediately after generation! Recommended: password manager (1Password, Bitwarden) or USB drive offline storage.

### 步骤 3：验证配置

```bash
# 检查文件存在
ls -la ~/.config/logseq-github-auto-sync/

# 检查权限
# identity.txt 应该是 600 (-rw-------)
# recipients.txt 应该是 644 (-rw-r--r--)
```

**完成！** 🎉 之后再也不用管密钥了。

---

## 四、多台电脑同步

### 场景：公司电脑 → 家里电脑

**你需要做的：**

1. ✅ **复制 identity.txt** 到家里电脑
   ```bash
   # 方法：U 盘 / 密码管理器 / 加密压缩包
   cp identity.txt ~/.config/logseq-github-auto-sync/
   ```

2. ✅ **安装插件**（参考 README 安装步骤）

3. ✅ **配置 GitHub repo URL**

4. ✅ **重启 Logseq，启用插件**

5. ✅ **完成！** 自动开始工作

**recipients.txt 需要吗？**
- ✅ 不需要（用 identity.txt 重新生成即可）
- ✅ 也可以复制过去（省一步操作）

> **English**: On a new computer, only 3 things needed: copy identity.txt → install plugin → configure GitHub repo URL.

---

## 五、丢失密钥的后果

### 🚨 核心警告

> **如果 identity.txt 丢失，之前加密的所有文件将永远无法解密！**

### 后果详情

```
GitHub 上的加密文件
├── pages/Salary.md          ← ❌ 永久丢失
├── pages/Diary-2026.md      ← ❌ 永久丢失
├── assets/Private-Photo.jpg ← ❌ 永久丢失
└── journals/                ← ❌ 全部丢失

你的笔记 → 永久丢失 💸
```

**为什么无法恢复：**
- ❌ GitHub 客服帮不了你（他们看不到明文）
- ❌ 密码破解软件没用（age 加密强度足够高）
- ✅ **只有 identity.txt 能救你**

### 如果丢失了

**情况 A：有备份 ✅**
```bash
# 从密码管理器/U盘恢复
cp ~/Documents/identity-backup/identity.txt ~/.config/logseq-github-auto-sync/
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt
# 搞定！所有文件都能解密
```

**情况 B：没有备份 ❌**
```bash
# 生成新密钥对
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

# ⚠️ 旧加密文件永久丢失
# ✅ 但新文件可以用新密钥加密
```

> **English**: If identity.txt is lost, all previously encrypted files will be PERMANENTLY UNDECRYPTABLE!
> - With backup → Restore and recover all files
> - No backup → Old files permanently lost, generate new key pair

---

## 六、备份策略

### 推荐方案：3-2-1 原则

```
3 份拷贝：
├── 主份：电脑上的 ~/.config/logseq-github-auto-sync/identity.txt
├── 备份 1：密码管理器（1Password / Bitwarden）
└── 备份 2：U 盘 / 移动硬盘（离线存储）

2 种介质：
├── 电脑硬盘
└── U 盘

1 份异地：
└── 密码管理器（云端同步）
```

### 备份方案对比

| 方案 | 安全性 | 便利性 | 成本 | 推荐度 |
|------|--------|--------|------|--------|
| **密码管理器** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 付费 | ✅✅✅✅✅ |
| **加密压缩包** | ⭐⭐⭐⭐ | ⭐⭐⭐ | 免费 | ✅✅✅✅ |
| **U 盘离线** | ⭐⭐⭐⭐⭐ | ⭐⭐ | 便宜 | ✅✅✅ |
| **什么都不做** | ⭐ | ⭐⭐⭐⭐⭐ | 免费 | ❌❌❌ |

### 测试备份有效性

**每年一次，确保备份可用：**

```bash
# 1. 模拟丢失主密钥
rm ~/.config/logseq-github-auto-sync/identity.txt

# 2. 从备份恢复
cp ~/Documents/identity-backup/identity.txt ~/.config/logseq-github-auto-sync/

# 3. 测试解密
cd ~/tmp && git clone git@github.com:you/your-logseq.git test-decrypt
cd test-decrypt
node ~/logseq-github-auto-sync/scripts/sync-helper.js decrypt-working-tree

# 4. 能解密 → 备份有效 ✅
# 解密失败 → 备份无效 ❌（立即重新备份）

# 5. 清理
rm -rf ~/tmp/backup-test ~/tmp/test-decrypt
```

> **English**: Test your backup annually! Simulate key loss, restore from backup, and verify decryption works. Untested backup = No backup.

---

## 七、团队协作

### 场景：和同事共享加密笔记

**步骤：**

1. **每个人生成自己的密钥对**
   ```bash
   # 你、Alice、Bob 各自执行
   age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt
   age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt
   ```

2. **收集所有人的 recipients.txt**
   ```
   ~/.config/logseq-github-auto-sync/recipients-team.txt
   ├── 你的 recipients.txt
   ├── Alice 的 recipients.txt
   └── Bob 的 recipients.txt
   ```

3. **配置插件**
   ```
   recipientsPath = ~/.config/logseq-github-auto-sync/recipients-team.txt
   ```

**效果：**
- 你加密的文件 → Alice 和 Bob 都能解密 ✅
- Alice 加密的文件 → 你也能解密 ✅
- 每个人用自己的私钥解密

> **English**: For team collaboration, each person has their own private key, but shares a combined recipients-team.txt file.
> 
> **Steps**:
> 1. Each person generates their own key pair
> 2. Collect everyone's recipients.txt into one file
> 3. Configure recipientsPath in plugin settings

---

## 八、常见问题

### Q1: recipients.txt 是什么？需要备份吗？

**A:** recipients.txt 是公钥，可以从 identity.txt 随时重新生成，**不需要备份**。

> **English**: recipients.txt is the public key and can be regenerated from identity.txt anytime. No backup needed.

### Q2: 在多台电脑用需要多套密钥吗？

**A:** 不需要。**同一套 identity.txt 可以复制到所有设备**，共享同一套加密文件。

> **English**: No. The same identity.txt can be copied to all devices to share the same encrypted files.

### Q3: 密钥有有效期吗？需要定期更换吗？

**A:** 理论上不需要。但如果怀疑密钥泄露，立即更换：
```bash
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt
```

> **English**: Theoretically no. But if you suspect key compromise, rotate immediately.

### Q4: 有人拿到了我的 identity.txt 怎么办？

**A:**
1. 立即生成新密钥对
2. 用新密钥重新加密所有文件（运行一次同步）
3. 旧密钥作废

> **English**: Generate new key pair immediately, re-encrypt all files, old key is now obsolete.

### Q5: 可以同时用多个 recipients 文件吗？

**A:** 可以。创建一个合并文件：
```bash
cat ~/.config/logseq-github-auto-sync/recipients.txt > ~/.config/logseq-github-auto-sync/recipients-team.txt
cat ~/Documents/alice-recipients.txt >> ~/.config/logseq-github-auto-sync/recipients-team.txt
```

> **English**: Yes. Create a combined file with multiple people's public keys.

---

## 九、快速参考

### 文件位置速查

| 文件 | 路径 | 用途 |
|------|------|------|
| 私钥 | `~/.config/logseq-github-auto-sync/identity.txt` | 解密（必须备份） |
| 公钥 | `~/.config/logseq-github-auto-sync/recipients.txt` | 加密（可重新生成） |

### 常用命令速查

```bash
# 生成密钥对
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

# 重新生成公钥（如果丢了）
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

# 设置权限
chmod 600 ~/.config/logseq-github-auto-sync/identity.txt
chmod 644 ~/.config/logseq-github-auto-sync/recipients.txt

# 解密整个工作区
node ~/logseq-github-auto-sync/scripts/sync-helper.js decrypt-working-tree

# 加密指定文件
age -R ~/.config/logseq-github-auto-sync/recipients.txt -o encrypted.md.age encrypted.md
```

### 安全检查清单

**首次设置（1 次）：**
- [ ] 生成 identity.txt 和 recipients.txt
- [ ] 备份 identity.txt 到密码管理器
- [ ] 备份 identity.txt 到 U 盘（可选）
- [ ] 设置正确的文件权限（600/644）

**日常使用（每月）：**
- [ ] 确认 identity.txt 仍然存在
- [ ] 确认密码管理器中的备份有效

**定期维护（每年）：**
- [ ] 测试备份有效性（参考第六节）
- [ ] 更新密码管理器备份
- [ ] 检查文件权限

---

## 十、核心原则（记住这些就够了）

### ✅ 要做的事

1. ✅ **备份 identity.txt**（生成后立刻备份）
2. ✅ **放到密码管理器**（最安全、最方便）
3. ✅ **定期测试备份**（每年一次）

### ❌ 不要做的事

1. ❌ **不要泄露 identity.txt**（绝对不能给别人）
2. ❌ **不要传到 GitHub**（插件会自动忽略，但不要冒险）
3. ❌ **不要依赖单点备份**（至少 2 个备份）

### 💡 黄金法则

> **identity.txt = 你的所有加密笔记**
>
> - 丢了它 = 丢了所有笔记
> - 备份它 = 备份一切
> - 保护它 = 保护你的隐私

---

## 十一、紧急情况处理

### 场景 1：电脑坏了，但有密码管理器备份

```bash
# 1. 买新电脑，安装 Logseq 和 age
# 2. 从密码管理器导出 identity.txt
# 3. 放到 ~/.config/logseq-github-auto-sync/
# 4. 克隆 GitHub 仓库
# 5. 运行解密命令
# 6. 搞定！5 分钟恢复所有笔记
```

### 场景 2：丢了 U 盘但密码管理器有备份

```bash
# 从密码管理器恢复
# 再买一个 U 盘备份即可
```

### 场景 3：怀疑密钥泄露

```bash
# 1. 生成新密钥对（1 分钟）
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

# 2. 运行一次完整同步（重新加密所有文件）
# 3. 旧密钥作废

# 4. 更新密码管理器中的备份
```

---

## 参考资源

- **完整文档**: [README.md](README.md) / [README (EN)](README.md)
- **快速开始**: [QUICKSTART.md](QUICKSTART.md) / [快速开始 (EN)](QUICKSTART.md)
- **架构说明**: [ARCHITECTURE.md](ARCHITECTURE.md) / [架构说明 (EN)](ARCHITECTURE.md)
- **贡献指南**: [CONTRIBUTING.md](CONTRIBUTING.md) / [贡献指南 (EN)](CONTRIBUTING.md)
- **插件仓库**: https://github.com/kadaliao/logseq-github-auto-sync
- **问题反馈**: https://github.com/kadaliao/logseq-github-auto-sync/issues

---

**最后提醒：**
> 🔑 **现在就备份 identity.txt！不要等到丢的那天。**

5 分钟的备份 = 几年的笔记安全。现在就做。 ✅
