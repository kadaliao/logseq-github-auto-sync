/**
 * Age encryption and decryption utilities.
 */

const { execSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");

/**
 * Generate a cryptographically secure temporary file suffix.
 * @returns {string}
 */
function generateTempSuffix() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Clean up temporary files (best effort).
 *
 * @param {...string} paths - File paths to clean up
 */
function cleanupTempFiles(...paths) {
  for (const p of paths) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    } catch (_) {
      // Best effort cleanup
    }
  }
}

/**
 * Atomically rename a file (cleanup on failure).
 *
 * @param {string} src - Source file
 * @param {string} dest - Destination file
 */
function atomicRename(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (error) {
    cleanupTempFiles(src);
    throw error;
  }
}

/**
 * Encrypt a file using age.
 *
 * @param {string} agePath - Path to age binary
 * @param {string} recipientsPath - Path to recipients file
 * @param {string} inputFile - File to encrypt
 * @param {string} outputFile - Output file (will be overwritten)
 * @returns {object} { exitCode, stdout, stderr }
 */
function encryptFile(agePath, recipientsPath, inputFile, outputFile) {
  const tmpFile = `${outputFile}.age-tmp-${generateTempSuffix()}`;
  try {
    const result = execSync(`${agePath} -R ${recipientsPath} -o ${tmpFile} ${inputFile}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });

    atomicRename(tmpFile, outputFile);
    return { exitCode: 0, stdout: result, stderr: "" };
  } catch (error) {
    cleanupTempFiles(tmpFile);
    throw new Error(`age encryption failed: ${error.stderr || error.stdout || error.message}`);
  }
}

/**
 * Decrypt a file using age.
 *
 * @param {string} agePath - Path to age binary
 * @param {string} identityPath - Path to identity file
 * @param {string} inputFile - File to decrypt
 * @param {string} outputFile - Output file (will be overwritten)
 * @returns {object} { exitCode, stdout, stderr }
 */
function decryptFile(agePath, identityPath, inputFile, outputFile) {
  const tmpFile = `${outputFile}.plain-tmp-${generateTempSuffix()}`;
  try {
    const result = execSync(`${agePath} -d -i ${identityPath} -o ${tmpFile} ${inputFile}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });

    atomicRename(tmpFile, outputFile);
    return { exitCode: 0, stdout: result, stderr: "" };
  } catch (error) {
    cleanupTempFiles(tmpFile);
    throw new Error(`age decryption failed: ${error.stderr || error.stdout || error.message}`);
  }
}

module.exports = {
  generateTempSuffix,
  cleanupTempFiles,
  atomicRename,
  encryptFile,
  decryptFile
};
