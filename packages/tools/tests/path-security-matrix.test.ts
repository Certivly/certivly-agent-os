import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { WorkspaceManager } from '../src/workspace';

describe('Action 3.14: Path Security Matrix', () => {
  let tempDir: string;
  let outsideDir: string;
  let wm: WorkspaceManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-sec-ws-'));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-sec-out-'));
    wm = new WorkspaceManager(tempDir);

    fs.mkdirSync(path.join(tempDir, 'src', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), '// safe');
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret data');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    } catch {}
  });

  // Minimum 20 path test cases across all categories:
  describe('1. Traversal and Escape Cases', () => {
    it('1. rejects simple parent traversal ../', () => {
      expect(() => wm.resolvePath('../secret.txt')).toThrow('Security Violation');
    });

    it('2. rejects multi-level parent traversal ../../../', () => {
      expect(() => wm.resolvePath('../../../../../etc/passwd')).toThrow('Security Violation');
    });

    it('3. rejects nested traversal escaping root', () => {
      expect(() => wm.resolvePath('src/nested/../../../../secret.txt')).toThrow('Security Violation');
    });

    it('4. rejects mixed forward and backward slashes traversal', () => {
      expect(() => wm.resolvePath('src\\nested/..\\..\\..\\outside.txt')).toThrow('Security Violation');
    });

    it('5. allows valid traversal that stays inside workspace', () => {
      const resolved = wm.resolvePath('src/nested/../index.ts');
      expect(resolved).toBe(path.resolve(tempDir, 'src', 'index.ts'));
    });
  });

  describe('2. Windows and UNC Path Cases', () => {
    it('6. rejects absolute Windows drive path outside workspace', () => {
      expect(() => wm.resolvePath('C:\\Windows\\System32\\calc.exe')).toThrow('Security Violation');
    });

    it('7. rejects alternative drive path', () => {
      expect(() => wm.resolvePath('Z:\\secret\\passwords.kdbx')).toThrow('Security Violation');
    });

    it('8. rejects UNC network path with backslashes', () => {
      expect(() => wm.resolvePath('\\\\192.168.1.100\\share\\payload.exe')).toThrow('Security Violation');
    });

    it('9. rejects UNC network path with forward slashes', () => {
      expect(() => wm.resolvePath('//attacker-server/share/exfil')).toThrow('Security Violation');
    });

    it('10. rejects Windows extended device path \\\\?\\', () => {
      expect(() => wm.resolvePath('\\\\?\\C:\\Windows\\win.ini')).toThrow('Security Violation');
    });
  });

  describe('3. Git Directory Protection', () => {
    it('11. rejects direct .git directory access', () => {
      expect(() => wm.resolvePath('.git')).toThrow('Security Violation');
    });

    it('12. rejects .git/config access', () => {
      expect(() => wm.resolvePath('.git/config')).toThrow('Security Violation');
    });

    it('13. rejects .git\\hooks\\pre-commit access', () => {
      expect(() => wm.resolvePath('.git\\hooks\\pre-commit')).toThrow('Security Violation');
    });

    it('14. rejects traversal reaching into .git', () => {
      expect(() => wm.resolvePath('src/../.git/HEAD')).toThrow('Security Violation');
    });

    it('15. rejects deep nested access to .git subfolder', () => {
      expect(() => wm.resolvePath('src/nested/../../.git/objects/pack')).toThrow('Security Violation');
    });
  });

  describe('4. URL Schemes and Injection Cases', () => {
    it('16. rejects file:// scheme', () => {
      expect(() => wm.resolvePath('file:///etc/passwd')).toThrow('Security Violation');
    });

    it('17. rejects http:// scheme', () => {
      expect(() => wm.resolvePath('http://169.254.169.254/latest/meta-data')).toThrow('Security Violation');
    });

    it('18. rejects https:// scheme', () => {
      expect(() => wm.resolvePath('https://raw.githubusercontent.com/malware.sh')).toThrow('Security Violation');
    });

    it('19. rejects ftp:// scheme', () => {
      expect(() => wm.resolvePath('ftp://ftp.server.com/malicious.bin')).toThrow('Security Violation');
    });

    it('20. rejects null byte injection in path', () => {
      expect(() => wm.resolvePath('src/index.ts\0.exe')).toThrow('Security Violation');
    });

    it('21. rejects empty and whitespace-only paths', () => {
      expect(() => wm.resolvePath('')).toThrow('Security Violation');
      expect(() => wm.resolvePath('    ')).toThrow('Security Violation');
    });
  });

  describe('5. Absolute Path and Symlink Resolution Cases', () => {
    it('22. rejects root filesystem absolute path /etc/shadow', () => {
      expect(() => wm.resolvePath('/etc/shadow')).toThrow('Security Violation');
    });

    it('23. rejects temporary directory outside workspace', () => {
      expect(() => wm.resolvePath(outsideDir)).toThrow('Security Violation');
    });

    it('24. resolveReal rejects symlink pointing outside workspace root', () => {
      const symlinkPath = path.join(tempDir, 'link-outside');
      try {
        fs.symlinkSync(outsideDir, symlinkPath, 'junction');
        expect(() => wm.resolveReal('link-outside')).toThrow('Security Violation');
      } catch (err: any) {
        // In environments where symlink creation requires admin, skip or test fallback
        if (err?.code !== 'EPERM') {
          throw err;
        }
      }
    });

    it('25. isWithinWorkspace accurately checks workspace bounds', () => {
      expect(wm.isWithinWorkspace(path.join(tempDir, 'src', 'index.ts'))).toBe(true);
      expect(wm.isWithinWorkspace(path.join(outsideDir, 'secret.txt'))).toBe(false);
      expect(wm.isWithinWorkspace(path.join(tempDir, '.git', 'config'))).toBe(false);
      expect(wm.isWithinWorkspace('http://evil.com')).toBe(false);
      expect(wm.isWithinWorkspace('\\\\server\\share')).toBe(false);
    });
  });
});
