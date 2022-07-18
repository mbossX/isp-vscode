// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import Stm32Isp from './stm32isp';

let localize = {} as any;
try {
  try {
    localize = eval(`require("../package.nls.${JSON.parse(process.env.VSCODE_NLS_CONFIG as string).locale.toLowerCase()}.json")`);
  } catch {
    localize = eval(`require("../package.nls.json")`);
  }
} catch { }

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const statusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	statusbar.tooltip = localize?.['extension.tool.tips'] || 'ISP download hex to board';
	statusbar.command = 'isp.execute';
  const title = localize?.['extension.tool.title'] || 'Download HEX';
	statusbar.text = '$(sort-precedence) ' + title;
	statusbar.show();

	const channel = vscode.window.createOutputChannel('isp');

	let disposable = vscode.commands.registerCommand('isp.execute', async () => {
		channel.show();
		channel.clear();
		channel.appendLine('start downloading...');
		let isp!: Stm32Isp;
		try {
			isp = new Stm32Isp(channel);
			await isp.run();
			channel.appendLine('all done');
		} catch (e) {
			channel.appendLine((e as Error).stack || e as any);
		} finally {
			isp?.close();
		}
		// vscode.window.showInformationMessage('hex path is ' + cfg.get('hex'));
	});

	context.subscriptions.push(disposable);
}

export function deactivate() { }
