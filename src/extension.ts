'use strict';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('runSqlBlock.execute', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const doc = editor.document;
    const cfg = vscode.workspace.getConfiguration();
    const commandToRun = cfg.get<string>('runSqlBlock.commandToRun', 'mssql.runQuery');
    const languages = cfg.get<string[]>('runSqlBlock.languages', ['sql', 'mysql', 'postgres', 'tsql']);
    const treatGo = cfg.get<boolean>('runSqlBlock.treatGoAsSeparator', false);

    if (languages.length && !languages.includes(doc.languageId)) {
      // Do nothing if we’re outside target languages
      return;
    }

    const cursor = editor.selection.active;

    // If on a blank line, prefer the nearest non-empty above (ADS often behaves like this)
    let line = cursor.line;
    if (isSeparatorLine(doc, line, treatGo)) {
      line = clampToDoc(doc, findPrevNonSeparator(doc, line - 1, treatGo));
      if (line < 0) { return; }
    }

    const start = findBlockStart(doc, line, treatGo);
    const end = findBlockEnd(doc, line, treatGo);

    // Create a selection from start of start-line to end-of end-line
    const startPos = new vscode.Position(start, 0);
    const endLine = doc.lineAt(end);
    const endPos = endLine.range.end;

    // If the block is actually empty (e.g., file of only blanks), bail
    if (start > end) { return; }

    // Apply selection
    editor.selections = [new vscode.Selection(startPos, endPos)];

    // Run the configured command (MSSQL: 'sql.executeQuery')
    await vscode.commands.executeCommand(commandToRun);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}

/* ---------- helpers ---------- */

function isSeparatorLine(doc: vscode.TextDocument, line: number, treatGo: boolean): boolean {
  if (line < 0 || line >= doc.lineCount) return true;
  const text = doc.lineAt(line).text;
  if (text.trim().length === 0) return true;
  if (treatGo && text.trim().toUpperCase() === 'GO') return true;
  return false;
}

function findPrevNonSeparator(doc: vscode.TextDocument, fromLine: number, treatGo: boolean): number {
  for (let i = fromLine; i >= 0; i--) {
    if (!isSeparatorLine(doc, i, treatGo)) return i;
  }
  return -1;
}

function findNextNonSeparator(doc: vscode.TextDocument, fromLine: number, treatGo: boolean): number {
  for (let i = fromLine; i < doc.lineCount; i++) {
    if (!isSeparatorLine(doc, i, treatGo)) return i;
  }
  return -1;
}

function findBlockStart(doc: vscode.TextDocument, line: number, treatGo: boolean): number {
  // Walk up until the previous line is a separator
  let i = line;
  while (i - 1 >= 0 && !isSeparatorLine(doc, i - 1, treatGo)) {
    i--;
  }
  // Jump forward if the “block” starts with separators
  const nextNonSep = findNextNonSeparator(doc, i, treatGo);
  return nextNonSep === -1 ? line : nextNonSep;
}

function findBlockEnd(doc: vscode.TextDocument, line: number, treatGo: boolean): number {
  // Walk down until the next line is a separator
  let i = line;
  while (i + 1 < doc.lineCount && !isSeparatorLine(doc, i + 1, treatGo)) {
    i++;
  }
  return i;
}

function clampToDoc(doc: vscode.TextDocument, line: number): number {
  if (line < 0) return 0;
  if (line >= doc.lineCount) return doc.lineCount - 1;
  return line;
}
