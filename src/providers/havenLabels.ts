// providers/havenLabels.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { Logger } from '../utils/logger';
import { tryAcquirePositronApi } from "@posit-dev/positron";
import { type RuntimeCodeExecutionMode, RuntimeErrorBehavior} from "@posit-dev/positron";

class HavenLabelsProvider {
    private positron: ReturnType<typeof tryAcquirePositronApi>;
    private executionMode: RuntimeCodeExecutionMode;
    private executionErrorBehavior: RuntimeErrorBehavior;
    constructor() {
        this.positron = tryAcquirePositronApi();
        if (!this.positron) Logger.info("Positron API not available.");
        this.executionMode = "silent" as RuntimeCodeExecutionMode;
        this.executionErrorBehavior = "continue" as RuntimeErrorBehavior;
        Logger.info("HavenLabelsProvider initialized.");
    }
    private async executeRCode(code: string, tmpPath: string): Promise<string | undefined> {
        if (!this.positron) return undefined;

        const observer = {
        onError: (error: string) =>
          vscode.window.showInformationMessage("Error:", error)
      };

        const result = await this.positron.runtime.executeCode("r", code, false, undefined, this.executionMode, this.executionErrorBehavior, observer);
        
        await this.waitForFile(tmpPath);

        const contents = fs.readFileSync(tmpPath, 'utf-8');
        const parsed = JSON.parse(contents);
        
        Logger.info("Haven Label:", parsed);

        if (!result || result.length === 0 || result[0] === "NULL") {
            return undefined;
        } else {
            return parsed;
        }
    }

    async getDataFrameColumnLabels(dfName: string, colName: string): Promise<string | undefined> {

        Logger.info(`Getting label for ${dfName}$${colName}`);
        const tmpPath = path.join(os.tmpdir(), `r_haven_labels_${Date.now()}.json`);
        const rTmpPath = tmpPath.replace(/\\/g, '/');

        // In the future provide an observer to handle errors. Especially missing r libraries
        const code = `
        jsonlite::write_json({
            tryCatch({
                if (is.data.frame(${dfName}) && haven::is.labelled(${dfName}$${colName})) {
                    dput(attr(${dfName}$${colName}, "label"))
                } else {
                    NULL
                }
            }, error = function(e) {
                NULL
            })},        
        path = "${rTmpPath}",
        auto_unbox = TRUE)
        `.trim();
        
        // extract result
        return await this.executeRCode(code, tmpPath);
    }

    /**
 * Waits for a file to appear in the file system, periodically checking for its
 * existence until a timeout is reached or the file is found.
 * @param filePath The path to the file to wait for.
 * @param timeout The maximum time to wait for the file to appear, in milliseconds.
 * @returns A promise that resolves when the file is found or rejects when the
 * timeout is reached.
 */
private async waitForFile(filePath: string, timeout = 500): Promise<void> {
    return new Promise((resolve, reject) => {
        const start = Date.now();

        const interval = setInterval(() => {
            if (fs.existsSync(filePath)) {
                clearInterval(interval);
                resolve();
            } else if (Date.now() - start > timeout) {
                clearInterval(interval);
                const error = new Error(vscode.l10n.t("Timeout waiting for file: {0}", filePath));
                vscode.window.showErrorMessage(error.message);
                reject(error);
            }
        }, 100);
    });
}
}

const HavenLabels = new HavenLabelsProvider();
export default HavenLabels;