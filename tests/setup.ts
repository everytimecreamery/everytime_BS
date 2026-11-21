import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Clean localStorage between tests
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

// Load .env.local into process.env for test runs if not already present
try {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (key && rest.length > 0) {
        const val = rest.join('=').replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {
  // ignore
}

