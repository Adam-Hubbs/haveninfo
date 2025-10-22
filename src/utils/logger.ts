// src/utils/logger.ts

import * as vscode from 'vscode';

class LoggerService {
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Haven Labels');
  }

  info(message: string, ...args: any[]) {
    const msg = this.formatMessage('INFO', message, args);
    this.outputChannel.appendLine(msg);
  }

  warn(message: string, ...args: any[]) {
    const msg = this.formatMessage('WARN', message, args);
    this.outputChannel.appendLine(msg);
  }

  error(message: string, error?: any) {
    const msg = this.formatMessage('ERROR', message, [error]);
    this.outputChannel.appendLine(msg);
    if (error?.stack) {
      this.outputChannel.appendLine(error.stack);
    }
  }

  debug(message: string, ...args: any[]) {
    const config = vscode.workspace.getConfiguration('havenLabels');
    if (config.get<boolean>('debug', false)) {
      const msg = this.formatMessage('DEBUG', message, args);
      this.outputChannel.appendLine(msg);
    }
  }

  show() {
    this.outputChannel.show();
  }

  private formatMessage(level: string, message: string, args: any[]): string {
    const timestamp = new Date().toISOString();
    const argsStr = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
    return `[${timestamp}] [${level}] ${message}${argsStr}`;
  }
}

export const Logger = new LoggerService();