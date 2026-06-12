const vscode = require('vscode');

const SECTION = 'files.exclude';

/**
 * Read ONLY the patterns the user has in their global (user) settings.
 * We use inspect().globalValue rather than get() so we never pick up the
 * built-in defaults (**\/.git, **\/.DS_Store, ...) and never write them back.
 * @returns {Record<string, boolean | object>}
 */
function getUserExcludes() {
  const inspected = vscode.workspace.getConfiguration().inspect(SECTION);
  const value = (inspected && inspected.globalValue) || {};
  return { ...value };
}

/**
 * Persist the patterns object to the user (global) settings.
 * @param {Record<string, boolean | object>} obj
 */
async function setUserExcludes(obj) {
  await vscode.workspace
    .getConfiguration()
    .update(SECTION, obj, vscode.ConfigurationTarget.Global);
}

/** A pattern is "hidden" when its value is strictly true. */
function isHidden(value) {
  return value === true;
}

class QuickHideProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren() {
    const excludes = getUserExcludes();
    const patterns = Object.keys(excludes).sort((a, b) =>
      a.localeCompare(b)
    );

    return patterns.map((pattern) => {
      const value = excludes[pattern];
      const hidden = isHidden(value);

      const item = new vscode.TreeItem(
        pattern,
        vscode.TreeItemCollapsibleState.None
      );
      item.id = pattern;
      item.pattern = pattern;
      item.contextValue = 'quickHidePattern';
      item.checkboxState = hidden
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked;
      item.tooltip =
        typeof value === 'object'
          ? `${pattern} (conditional rule — toggle to override with a boolean)`
          : hidden
          ? `Hidden: ${pattern}`
          : `Visible: ${pattern}`;
      return item;
    });
  }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const provider = new QuickHideProvider();

  const treeView = vscode.window.createTreeView('quickHideExcludes', {
    treeDataProvider: provider,
    showCollapseAll: false,
    manageCheckboxStateManually: true,
  });

  // Toggle hidden/visible when a checkbox flips.
  treeView.onDidChangeCheckboxState(async (event) => {
    const excludes = getUserExcludes();
    for (const [item, state] of event.items) {
      excludes[item.pattern] =
        state === vscode.TreeItemCheckboxState.Checked;
    }
    await setUserExcludes(excludes);
  });

  const add = vscode.commands.registerCommand('quickHide.add', async () => {
    const existing = getUserExcludes();
    const pattern = await vscode.window.showInputBox({
      title: 'Add files.exclude pattern',
      prompt: 'Glob pattern to hide. Added as hidden (true) by default.',
      placeHolder: 'e.g. **/.turbo  or  **/dist',
      validateInput: (raw) => {
        const v = (raw || '').trim();
        if (!v) return 'Pattern cannot be empty';
        if (Object.prototype.hasOwnProperty.call(existing, v)) {
          return 'That pattern already exists';
        }
        return null;
      },
    });
    if (!pattern) return;
    existing[pattern.trim()] = true;
    await setUserExcludes(existing);
  });

  const edit = vscode.commands.registerCommand(
    'quickHide.edit',
    async (item) => {
      const oldPattern = item && item.pattern;
      if (!oldPattern) return;
      const excludes = getUserExcludes();
      const newPattern = await vscode.window.showInputBox({
        title: 'Edit pattern',
        value: oldPattern,
        validateInput: (raw) => {
          const v = (raw || '').trim();
          if (!v) return 'Pattern cannot be empty';
          if (
            v !== oldPattern &&
            Object.prototype.hasOwnProperty.call(excludes, v)
          ) {
            return 'That pattern already exists';
          }
          return null;
        },
      });
      if (!newPattern || newPattern.trim() === oldPattern) return;

      // Preserve order while renaming the key, keep the same value.
      const rebuilt = {};
      for (const [key, value] of Object.entries(excludes)) {
        rebuilt[key === oldPattern ? newPattern.trim() : key] = value;
      }
      await setUserExcludes(rebuilt);
    }
  );

  const remove = vscode.commands.registerCommand(
    'quickHide.delete',
    async (item) => {
      const pattern = item && item.pattern;
      if (!pattern) return;
      const excludes = getUserExcludes();
      delete excludes[pattern];
      await setUserExcludes(excludes);
    }
  );

  const refresh = vscode.commands.registerCommand('quickHide.refresh', () =>
    provider.refresh()
  );

  // Keep the view in sync when settings.json changes from elsewhere.
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION)) provider.refresh();
  });

  context.subscriptions.push(
    treeView,
    add,
    edit,
    remove,
    refresh,
    configWatcher
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
