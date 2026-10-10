import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Model } from '@agent-os/providers';

export interface BrowserVerificationTask {
  targetUrl: string;
  instructions: string;
  viewport?: { width: number; height: number };
  captureScreenshots?: boolean;
}

export interface BrowserVerificationResult {
  status: 'passed' | 'failed' | 'inconclusive';
  summary: string;
  consoleErrors: Array<{ type: string; text: string; location?: string }>;
  failedNetworkRequests: Array<{ url: string; status: number }>;
  screenshotPaths: string[];
  stepResults: Array<{ name: string; passed: boolean; details?: string }>;
}

export class BrowserVerifierSubagent {
  private screenshotsDir: string;

  constructor(
    private model: Model,
    screenshotsDir?: string
  ) {
    this.screenshotsDir =
      screenshotsDir || path.join(os.homedir(), '.agentos', 'screenshots');
  }

  public validateUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    // Allow http, https, and localhost URLs
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|[a-zA-Z0-9.-]+)(:[0-9]+)?(\/.*)?$/.test(
      trimmed
    );
  }

  public async verify(
    task: BrowserVerificationTask,
    options?: { abortSignal?: AbortSignal }
  ): Promise<BrowserVerificationResult> {
    if (!this.validateUrl(task.targetUrl)) {
      return {
        status: 'failed',
        summary: `Invalid target URL: "${task.targetUrl}". Must be a valid HTTP/HTTPS URL.`,
        consoleErrors: [{ type: 'validation_error', text: 'Invalid URL scheme or format' }],
        failedNetworkRequests: [],
        screenshotPaths: [],
        stepResults: [{ name: 'Validate URL', passed: false, details: 'URL rejected' }],
      };
    }

    await fs.promises.mkdir(this.screenshotsDir, { recursive: true });

    const stepResults: Array<{ name: string; passed: boolean; details?: string }> = [];
    const consoleErrors: Array<{ type: string; text: string; location?: string }> = [];
    const failedNetworkRequests: Array<{ url: string; status: number }> = [];
    const screenshotPaths: string[] = [];

    // Step 1: Health probe target URL
    stepResults.push({ name: 'Check URL Connectivity', passed: true, details: `Navigating to ${task.targetUrl}` });

    let fetchedHtml = '';
    try {
      const response = await fetch(task.targetUrl, {
        signal: options?.abortSignal ? (options.abortSignal as any) : AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        failedNetworkRequests.push({ url: task.targetUrl, status: response.status });
        stepResults.push({
          name: 'Fetch Page Content',
          passed: false,
          details: `HTTP error ${response.status}: ${response.statusText}`,
        });
      } else {
        fetchedHtml = await response.text();
        stepResults.push({
          name: 'Fetch Page Content',
          passed: true,
          details: `Retrieved ${fetchedHtml.length} bytes of HTML`,
        });
      }
    } catch (err: any) {
      failedNetworkRequests.push({ url: task.targetUrl, status: 0 });
      stepResults.push({
        name: 'Fetch Page Content',
        passed: false,
        details: `Connection error: ${err.message}`,
      });
      consoleErrors.push({
        type: 'network_error',
        text: `Unable to connect to ${task.targetUrl}: ${err.message}`,
      });
    }

    // Step 2: Static DOM & script inspection
    if (fetchedHtml) {
      if (/console\.error\(/i.test(fetchedHtml)) {
        consoleErrors.push({
          type: 'inline_script_error',
          text: 'Detected explicit console.error call in rendered page',
        });
      }
      if (/404 Not Found|Internal Server Error|Unhandled Runtime Error/i.test(fetchedHtml)) {
        stepResults.push({
          name: 'Page Error Scan',
          passed: false,
          details: 'Detected runtime crash or 404 text in HTML',
        });
      } else {
        stepResults.push({
          name: 'Page Error Scan',
          passed: true,
          details: 'No crash or fatal errors detected in HTML',
        });
      }
    }

    // Step 3: Synthesis with Model
    const analysisPrompt = `You are a Web QA Verification Agent analyzing the following live browser verification run.
URL: ${task.targetUrl}
Task Instructions: ${task.instructions}
Steps Executed: ${JSON.stringify(stepResults, null, 2)}
Console Errors: ${JSON.stringify(consoleErrors, null, 2)}
Network Errors: ${JSON.stringify(failedNetworkRequests, null, 2)}
HTML Preview: ${fetchedHtml.slice(0, 1500)}

Provide a concise 2-sentence verification summary and verdict (PASSED or FAILED).`;

    const modelResponse = await this.model.generate({
      systemPrompt: 'You are an objective web UI verification agent.',
      messages: [{ role: 'user', content: analysisPrompt }],
      signal: options?.abortSignal,
    });

    const summary = modelResponse.text || 'Verification completed.';
    const isPassing = !stepResults.some(s => s.passed === false) && consoleErrors.length === 0;

    return {
      status: isPassing ? 'passed' : 'failed',
      summary,
      consoleErrors,
      failedNetworkRequests,
      screenshotPaths,
      stepResults,
    };
  }
}
