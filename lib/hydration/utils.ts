/**
 * Hydration Engine Utilities
 * Common utility functions used across the hydration engine
 */

/**
 * Sleep utility for delays between tasks
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Escape special characters in OData filter strings
 * Single quotes must be doubled in OData $filter expressions
 */
export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Check if an object contains secret placeholders
 * Used to warn users that secrets need manual configuration
 */
export function containsSecretPlaceholders(obj: unknown): boolean {
  if (obj === null || obj === undefined) {
    return false;
  }

  if (typeof obj === "string") {
    // Check for common placeholder patterns
    const placeholders = ["<YOUR", "YOUR_", "PLACEHOLDER", "CHANGE_ME", "TODO"];
    const upper = obj.toUpperCase();
    return placeholders.some(p => upper.includes(p));
  }

  if (Array.isArray(obj)) {
    return obj.some((item) => containsSecretPlaceholders(item));
  }

  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    // Check if this is a password setting
    const settingDefId = record.settingDefinitionId as string || "";
    const isPasswordSetting = settingDefId.toLowerCase().includes("password") ||
      settingDefId.toLowerCase().includes("secret");

    if (isPasswordSetting) {
      // Check the value for placeholders
      const value = record.simpleSettingValue || record.value;
      if (containsSecretPlaceholders(value)) {
        return true;
      }
    }

    // Recursively check all values
    return Object.values(record).some(v => containsSecretPlaceholders(v));
  }

  return false;
}

/**
 * Determine if a setting definition ID represents an actual secret/credential field
 * that should be converted to SecretSettingValue type
 *
 * Rules:
 * 1. Must contain 'password', 'secret', 'credential', 'psk', 'key', 'token', or 'pin'
 * 2. Must NOT be a policy/configuration setting (like password requirements)
 * 3. Must NOT be a display/UI setting (like "show password")
 */
export function isActualSecretField(settingDefId: string): boolean {
  const lower = settingDefId.toLowerCase();

  // Patterns that indicate actual credential/secret VALUE fields
  const secretPatterns = [
    /_password$/,           // Ends with _password
    /password$/,            // Ends with password (e.g., networkpassword)
    /_pskvalue/,            // WiFi PSK
    /_secretkey/,           // Secret keys
    /_sharedkey/,           // Shared keys
    /_preSharedKey/i,       // Pre-shared keys
    /wifi.*password/i,      // WiFi passwords
    /network.*key/i,        // Network keys
    /network.*password/i,   // Network passwords (Cloud Remediation)
    /vpn.*secret/i,         // VPN secrets
    /_passphrase/,          // Passphrases
  ];

  // Patterns that should NOT trigger secret conversion (settings ABOUT passwords, not password values)
  const excludePatterns = [
    /passwordprotected/i,   // Settings about password-protected files
    /passwordrequired/i,    // Whether password is required
    /passwordexpir/i,       // Password expiration settings
    /passwordlength/i,      // Password length requirements
    /passwordquality/i,     // Password quality settings
    /passwordhistory/i,     // Password history settings
    /encryptiontype/i,      // Encryption type settings
    /encryptionstore/i,     // Encryption store settings (e.g., networkpasswordencryptionstore)
  ];

  // If it matches an exclude pattern, it's not a secret field
  if (excludePatterns.some(p => p.test(lower))) {
    return false;
  }

  // If it matches a secret pattern, it is a secret field
  return secretPatterns.some(p => p.test(lower));
}
