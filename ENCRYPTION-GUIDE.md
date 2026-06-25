# GitHub Auto Sync - Encryption & Key Management Guide

**Version**: 0.2.0
**Last Updated**: 2026-06-25
**Author**: Kada Liao (kadaliao@gmail.com)

---

## Table of Contents

- [1. Core Concepts (30-Second Overview)](#1-core-concepts-30-second-overview)
- [2. Files You Need to Manage](#2-files-you-need-to-manage)
- [3. First-Time Setup (5 Minutes)](#3-first-time-setup-5-minutes)
- [4. Multi-Device Synchronization](#4-multi-device-synchronization)
- [5. Consequences of Losing Your Keys](#5-consequences-of-losing-your-keys)
- [6. Backup Strategies](#6-backup-strategies)
- [7. Team Collaboration](#7-team-collaboration)
- [8. Frequently Asked Questions](#8-frequently-asked-questions)
- [9. Quick Reference](#9-quick-reference)
- [10. Core Principles](#10-core-principles)
- [11. Emergency Procedures](#11-emergency-procedures)

---

## 1. Core Concepts (30-Second Overview)

### What is Encryption?

> **Encryption = Locking files with a "public lock" that only you can open with a "unique key"**

**Real-World Analogy:**
- 🔒 **Public Key (recipients.txt)** = A lock you can give to others
- 🔑 **Private Key (identity.txt)** = The only key that can open that lock
- 📦 **Encrypted File** = A safe locked with that lock

**Core Principles:**
- Public keys can be shared freely (giving someone a lock is safe)
- Private keys must never be exposed (losing your key = losing access)
- Without the private key = permanent data loss (mathematically impossible to crack)

> **中文说明**: 加密就像用一把"公开的锁"锁住文件，只有你有"唯一的钥匙"能打开。
> - 公钥（recipients.txt）= 锁，可以随便给人
> - 私钥（identity.txt）= 钥匙，绝对不能丢
> - 丢了钥匙 = 文件永久丢失（数学上无法破解）

---

## 2. Files You Need to Manage

### File Checklist (Only 2 Files)

```
~/.config/logseq-github-auto-sync/
├── identity.txt      ← 🔑 Private Key (MUST BACKUP! NEVER EXPOSE!)
└── recipients.txt    ← 🔒 Public Key (safe to share, no risk)
```

### identity.txt (Private Key)

**What it is:**
- Your personal private key
- The **only** way to decrypt encrypted files
- File content example:
  ```
  AGE-SECRET-KEY-1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
  ```

**Default Location:**
```bash
~/.config/logseq-github-auto-sync/identity.txt
# Full path: /Users/YourUsername/.config/logseq-github-auto-sync/identity.txt
```

**What you need to do:**
1. ✅ **Generate once** (30 seconds)
2. ✅ **Backup once** (1 minute)
3. ✅ **Never touch again** (plugin uses it automatically)

**Absolute Prohibitions:**
- ❌ Never upload to GitHub
- ❌ Never paste into Logseq notes
- ❌ Never send via chat/email
- ❌ Never store on Desktop/Downloads

> **中文**: identity.txt 是你的私钥，解密文件的唯一方法。生成后备份一次，就再也不用管了。

### recipients.txt (Public Key)

**What it is:**
- Public encryption key
- Used to encrypt files (cannot decrypt)
- Safe to share with anyone

**What you need to do:**
- ✅ Nothing (plugin uses it automatically)
- ✅ For team sharing: collect everyone's recipients.txt

> **中文**: recipients.txt 是公钥，用于加密。可以随便分享，没有风险。

---

## 3. First-Time Setup (5 Minutes)

### Step 1: Generate Key Pair

```bash
# Create directory
mkdir -p ~/.config/logseq-github-auto-sync
chmod 700 ~/.config/logseq-github-auto-sync

# Generate private key (saved to identity.txt)
umask 077
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt

# Generate public key (saved to recipients.txt)
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

# Set permissions
chmod 600 ~/.config/logseq-github-auto-sync/identity.txt
chmod 644 ~/.config/logseq-github-auto-sync/recipients.txt
```

> **中文说明**: 
> - `umask 077` 确保文件权限最严格
> - `chmod 600` = 只有你能读写 identity.txt
> - `chmod 644` = 所有人都能读 recipients.txt（没关系）

### Step 2: Immediately Backup identity.txt

**Recommended Methods (by priority):**

1. **Password Manager** (Most Recommended)
   - 1Password / Bitwarden / KeePassXC
   - Create secure note, paste identity.txt content

2. **Offline Storage**
   - USB drive / external SSD
   - Encrypted zip: `zip -e identity-backup.zip identity.txt`

3. **Cloud Storage** (Alternative)
   - iCloud / Dropbox (only if encrypted first)

> **中文**: 生成密钥后**立刻备份**！推荐用密码管理器（1Password、Bitwarden）或 U 盘离线存储。

### Step 3: Verify Configuration

```bash
# Check files exist
ls -la ~/.config/logseq-github-auto-sync/

# Check permissions
# identity.txt should be 600 (-rw-------)
# recipients.txt should be 644 (-rw-r--r--)
```

**Done!** 🎉 You'll never need to touch the keys again.

---

## 4. Multi-Device Synchronization

### Scenario: Work Computer → Home Computer

**What you need to do:**

1. ✅ **Copy identity.txt** to home computer
   ```bash
   # Methods: USB drive / password manager / encrypted zip
   cp identity.txt ~/.config/logseq-github-auto-sync/
   ```

2. ✅ **Install plugin** (see README for installation steps)

3. ✅ **Configure GitHub repo URL**

4. ✅ **Restart Logseq, enable plugin**

5. ✅ **Done!** It works automatically.

**Do you need recipients.txt?**
- ✅ Not required (recreate from identity.txt)
- ✅ Or copy it (saves one step)

> **中文**: 在新电脑上只需要做 3 件事：复制 identity.txt → 安装插件 → 配置 GitHub repo URL。

---

## 5. Consequences of Losing Your Keys

### 🚨 Critical Warning

> **If identity.txt is lost, all previously encrypted files will be PERMANENTLY UNDECRYPTABLE!**

### What Happens

```
Encrypted files on GitHub
├── pages/Salary.md          ← ❌ Permanently lost
├── pages/Diary-2026.md      ← ❌ Permanently lost
├── assets/Private-Photo.jpg ← ❌ Permanently lost
└── journals/                ← ❌ All lost

Your notes → Gone forever 💸
```

**Why recovery is impossible:**
- ❌ GitHub support can't help (they can't read encrypted files)
- ❌ Password cracking won't work (age encryption is strong enough)
- ✅ **Only identity.txt can save you**

### If You Lose Your Keys

**Scenario A: You have a backup ✅**
```bash
# Restore from password manager / USB drive
cp ~/Documents/identity-backup/identity.txt ~/.config/logseq-github-auto-sync/
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt
# Done! All files are recoverable
```

**Scenario B: No backup ❌**
```bash
# Generate new key pair
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

# ⚠️ Old encrypted files are permanently lost
# ✅ But new files can be encrypted with the new key
```

> **中文**: 如果丢失 identity.txt，之前加密的所有文件将**永远无法解密**！
> - 有备份 → 恢复即可
> - 没备份 → 旧文件永久丢失，只能生成新密钥对

---

## 6. Backup Strategies

### Recommended: 3-2-1 Backup Rule

```
3 Copies:
├── Primary: Computer's ~/.config/logseq-github-auto-sync/identity.txt
├── Backup 1: Password manager (1Password / Bitwarden)
└── Backup 2: USB drive / external SSD (offline storage)

2 Media Types:
├── Computer hard drive
└── USB drive

1 Offsite Copy:
└── Password manager (cloud-synced)
```

### Backup Method Comparison

| Method | Security | Convenience | Cost | Recommendation |
|--------|----------|-------------|------|----------------|
| **Password Manager** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Paid | ✅✅✅✅✅ |
| **Encrypted Zip** | ⭐⭐⭐⭐ | ⭐⭐⭐ | Free | ✅✅✅✅ |
| **USB Drive** | ⭐⭐⭐⭐⭐ | ⭐⭐ | Cheap | ✅✅✅ |
| **Print It** | ⭐⭐⭐⭐⭐ | ⭐ | Very Low | ✅✅ |
| **Do Nothing** | ⭐ | ⭐⭐⭐⭐⭐ | Free | ❌❌❌ |

### Testing Your Backup (Annual Ritual)

**Why test?**
> **Untested backup = No backup**

You might encounter:
- File corruption during copy
- Forgotten zip password
- Failed password manager export

**Test steps (once per year):**

```bash
# 1. Create temporary directory
mkdir -p ~/tmp/backup-test && cd ~/tmp/backup-test

# 2. Simulate key loss
rm ~/.config/logseq-github-auto-sync/identity.txt

# 3. Restore from backup
# Method A: Copy from password manager
# Method B: Copy from USB drive
# Method C: Extract encrypted zip
cp ~/Documents/identity-backup/identity.txt ~/.config/logseq-github-auto-sync/

# 4. Test decryption
cd ~/tmp && git clone git@github.com:you/your-logseq.git test-decrypt
cd test-decrypt
node ~/logseq-github-auto-sync/scripts/sync-helper.js decrypt-working-tree

# 5. Success = Backup works ✅
#    Failure = Backup invalid ❌ (re-backup immediately!)

# 6. Cleanup
rm -rf ~/tmp/backup-test ~/tmp/test-decrypt
```

> **中文**: 
> - 每年测试一次备份
> - 模拟丢失主密钥，从备份恢复，测试是否能解密
> - 没测试过的备份 = 没有备份

---

## 7. Team Collaboration

### Scenario: Share Encrypted Notes with Colleagues

**Steps:**

1. **Each person generates their own key pair**
   ```bash
   # You, Alice, and Bob each run:
   age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt
   age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt
   ```

2. **Collect everyone's recipients.txt**
   ```
   ~/.config/logseq-github-auto-sync/recipients-team.txt
   ├── Your recipients.txt
   ├── Alice's recipients.txt
   └── Bob's recipients.txt
   ```

3. **Configure plugin**
   ```
   recipientsPath = ~/.config/logseq-github-auto-sync/recipients-team.txt
   ```

**Result:**
- Files you encrypt → Alice and Bob can decrypt ✅
- Files Alice encrypts → You can decrypt ✅
- Everyone uses their own private key to decrypt

> **中文**: 团队协作时，每个人有自己的私钥，但共享一个 recipients-team.txt 文件。
> 
> **步骤**: 
> 1. 每人生成自己的密钥对
> 2. 收集所有人的 recipients.txt 到一个文件
> 3. 在插件设置中配置 recipientsPath

---

## 8. Frequently Asked Questions

### Q1: What is recipients.txt? Do I need to back it up?

**A:** recipients.txt is the public key. It can be regenerated from identity.txt anytime. **No backup needed.**

> **中文**: recipients.txt 是公钥，可以从 identity.txt 随时重新生成，不需要备份。

### Q2: Do I need separate keys for multiple devices?

**A:** No. **The same identity.txt can be copied to all devices** to share the same encrypted files.

> **中文**: 不需要。同一套 identity.txt 可以复制到所有设备，共享同一套加密文件。

### Q3: Do keys expire? Should I rotate them regularly?

**A:** Theoretically, no. But if you suspect key compromise, rotate immediately:
```bash
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt
```

> **中文**: 理论上不需要定期更换。但如果怀疑密钥泄露，立即生成新密钥对。

### Q4: What if someone gets my identity.txt?

**A:**
1. Generate new key pair immediately
2. Re-encrypt all files (run one full sync)
3. Old key is now compromised (but they can't decrypt past files without it)

> **中文**: 如果怀疑密钥泄露，立即生成新密钥对并重新同步所有文件。

### Q5: Can I use multiple recipients files?

**A:** Yes. Create a combined file:
```bash
cat ~/.config/logseq-github-auto-sync/recipients.txt > ~/.config/logseq-github-auto-sync/recipients-team.txt
cat ~/Documents/alice-recipients.txt >> ~/.config/logseq-github-auto-sync/recipients-team.txt
```

> **中文**: 可以。创建一个合并文件，包含多个人的公钥即可。

---

## 9. Quick Reference

### File Location Cheat Sheet

| File | Path | Purpose |
|------|------|---------|
| Private Key | `~/.config/logseq-github-auto-sync/identity.txt` | Decryption (MUST BACKUP) |
| Public Key | `~/.config/logseq-github-auto-sync/recipients.txt` | Encryption (regeneratable) |

### Common Commands

```bash
# Generate key pair
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

# Regenerate public key (if lost)
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

# Set permissions
chmod 600 ~/.config/logseq-github-auto-sync/identity.txt
chmod 644 ~/.config/logseq-github-auto-sync/recipients.txt

# Decrypt entire workspace
node ~/logseq-github-auto-sync/scripts/sync-helper.js decrypt-working-tree

# Encrypt specific file
age -R ~/.config/logseq-github-auto-sync/recipients.txt -o encrypted.md.age encrypted.md
```

### Security Checklist

**First-time Setup (once):**
- [ ] Generate identity.txt and recipients.txt
- [ ] Backup identity.txt to password manager
- [ ] Backup identity.txt to USB drive (optional)
- [ ] Set correct file permissions (600/644)

**Monthly:**
- [ ] Confirm identity.txt still exists
- [ ] Confirm password manager backup is accessible

**Yearly:**
- [ ] Test backup validity (see Section 6)
- [ ] Update password manager backup
- [ ] Check file permissions

---

## 10. Core Principles

### ✅ Do This

1. ✅ **Backup identity.txt** (immediately after generation)
2. ✅ **Use password manager** (safest, most convenient)
3. ✅ **Test backups annually** (ensure they work)

### ❌ Don't Do This

1. ❌ **Never expose identity.txt** (absolutely never share)
2. ❌ **Never upload to GitHub** (plugin ignores it, but don't risk it)
3. ❌ **Never rely on single backup** (minimum 2 backups)

### 💡 Golden Rule

> **identity.txt = All your encrypted notes**
>
> - Lose it = Lose everything
> - Backup it = Backup everything
> - Protect it = Protect your privacy

---

## 11. Emergency Procedures

### Scenario 1: Computer died, but password manager backup exists

```bash
# 1. Buy new computer, install Logseq and age
# 2. Export identity.txt from password manager
# 3. Place in ~/.config/logseq-github-auto-sync/
# 4. Clone GitHub repository
# 5. Run decryption command
# 6. Done! All notes recovered in 5 minutes
```

### Scenario 2: Lost USB drive, but password manager has backup

```bash
# Restore from password manager
# Buy new USB drive for backup
```

### Scenario 3: Suspect key compromise

```bash
# 1. Generate new key pair (1 minute)
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

# 2. Run one full sync (re-encrypt all files)
# 3. Old key is now obsolete

# 4. Update password manager backup
```

---

## Appendix: Real-World Examples

### Example A: Had backup ✅

> "I got a new Mac, exported identity.txt from 1Password, recovered all encrypted notes in 5 minutes."

### Example B: No backup ❌

> "Hard drive failed, identity.txt was lost, 3 years of encrypted notes gone 😭"
> 
> —— This is not a joke, it really happens

---

## Quick Action Checklist

**Do this NOW (5 minutes):**

```bash
# 1. Check if identity.txt exists
ls -la ~/.config/logseq-github-auto-sync/identity.txt

# 2. If exists, backup to password manager
# Open 1Password/Bitwarden, paste identity.txt content

# 3. Extra backup to USB drive
cp ~/.config/logseq-github-auto-sync/identity.txt /Volumes/USB/

# 4. Set reminder
# Add calendar event: remind in 12 months to test backup
```

**Completing these 4 steps = peace of mind!** 🎉

---

## Additional Resources

- **Full Documentation**: [README.md](https://github.com/kadaliao/logseq-github-auto-sync/blob/main/README.md)
- **Quick Start**: [QUICKSTART.md](https://github.com/kadaliao/logseq-github-auto-sync/blob/main/QUICKSTART.md)
- **Architecture**: [ARCHITECTURE.md](https://github.com/kadaliao/logseq-github-auto-sync/blob/main/ARCHITECTURE.md)
- **Plugin Repository**: https://github.com/kadaliao/logseq-github-auto-sync
- **Report Issues**: https://github.com/kadaliao/logseq-github-auto-sync/issues

---

**Final Reminder:**
> 🔑 **Backup identity.txt NOW! Don't wait until it's too late.**
> 
> 5 minutes of backup work = Years of notes secured. Do it now. ✅
