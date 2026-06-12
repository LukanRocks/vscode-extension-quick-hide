const vscode = require('vscode');

const SECTION = 'files.exclude';
const GROUPS = 'quickHide.groups';

/* ------------------------------------------------------------------ */
/* settings helpers — everything reads/writes USER (global) scope only */
/* ------------------------------------------------------------------ */

/**
 * The patterns the user has in their global (user) settings.
 * Uses inspect().globalValue so we never pick up VS Code's built-in
 * defaults and never write them back.
 * @returns {Record<string, boolean | object>}
 */
function getUserExcludes() {
  const inspected = vscode.workspace.getConfiguration().inspect(SECTION);
  return { ...((inspected && inspected.globalValue) || {}) };
}

async function setUserExcludes(obj) {
  await vscode.workspace
    .getConfiguration()
    .update(SECTION, obj, vscode.ConfigurationTarget.Global);
}

/**
 * Group definitions: { groupName: [pattern, ...] }. Stored in the user's
 * global settings under `quickHide.groups`.
 * @returns {Record<string, string[]>}
 */
function getGroups() {
  const inspected = vscode.workspace.getConfiguration().inspect(GROUPS);
  const raw = (inspected && inspected.globalValue) || {};
  const out = {};
  for (const [name, patterns] of Object.entries(raw)) {
    out[name] = Array.isArray(patterns) ? [...patterns] : [];
  }
  return out;
}

async function setGroups(obj) {
  await vscode.workspace
    .getConfiguration()
    .update(GROUPS, obj, vscode.ConfigurationTarget.Global);
}

/** Map of pattern -> the group it belongs to (if any). */
function buildMembership(groups) {
  const membership = {};
  for (const [name, patterns] of Object.entries(groups)) {
    for (const p of patterns) membership[p] = name;
  }
  return membership;
}

const isHidden = (value) => value === true;

/* ------------------------------------------------------------------ */
/* tree                                                                */
/* ------------------------------------------------------------------ */

function makeGroupItem(name, patterns, excludes) {
  const members = patterns.filter((p) =>
    Object.prototype.hasOwnProperty.call(excludes, p)
  );
  const hiddenCount = members.filter((p) => isHidden(excludes[p])).length;
  const allHidden = members.length > 0 && hiddenCount === members.length;

  const item = new vscode.TreeItem(
    name,
    vscode.TreeItemCollapsibleState.Expanded
  );
  item.id = 'group:' + name;
  item.kind = 'group';
  item.groupName = name;
  item.patterns = members;
  item.contextValue = 'quickHideGroup';
  item.iconPath = new vscode.ThemeIcon('folder');
  item.checkboxState = allHidden
    ? vscode.TreeItemCheckboxState.Checked
    : vscode.TreeItemCheckboxState.Unchecked;
  item.description = `${hiddenCount}/${members.length} hidden`;
  item.tooltip = `Group "${name}" — toggle to hide/show all ${members.length} pattern(s)`;
  return item;
}

function makePatternItem(pattern, value, groupName) {
  const hidden = isHidden(value);
  const item = new vscode.TreeItem(
    pattern,
    vscode.TreeItemCollapsibleState.None
  );
  item.id = (groupName ? 'group:' + groupName + ':' : 'root:') + pattern;
  item.kind = 'pattern';
  item.pattern = pattern;
  item.group = groupName || null;
  item.contextValue = groupName
    ? 'quickHidePatternGrouped'
    : 'quickHidePattern';
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

  getChildren(element) {
    const excludes = getUserExcludes();

    // Children of a group folder.
    if (element && element.kind === 'group') {
      return element.patterns
        .filter((p) => Object.prototype.hasOwnProperty.call(excludes, p))
        .sort((a, b) => a.localeCompare(b))
        .map((p) => makePatternItem(p, excludes[p], element.groupName));
    }

    // Root: group folders first, then ungrouped patterns.
    const groups = getGroups();
    const membership = buildMembership(groups);

    const groupNodes = Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => makeGroupItem(name, groups[name], excludes));

    const ungrouped = Object.keys(excludes)
      .filter((p) => !membership[p])
      .sort((a, b) => a.localeCompare(b))
      .map((p) => makePatternItem(p, excludes[p], null));

    return [...groupNodes, ...ungrouped];
  }
}

/* ------------------------------------------------------------------ */
/* activation                                                          */
/* ------------------------------------------------------------------ */

function activate(context) {
  const provider = new QuickHideProvider();

  const treeView = vscode.window.createTreeView('quickHideExcludes', {
    treeDataProvider: provider,
    showCollapseAll: true,
    manageCheckboxStateManually: true,
  });

  // Checkbox flips: a pattern toggles itself; a group toggles all members.
  treeView.onDidChangeCheckboxState(async (event) => {
    const excludes = getUserExcludes();
    for (const [item, state] of event.items) {
      const hidden = state === vscode.TreeItemCheckboxState.Checked;
      if (item.kind === 'group') {
        for (const p of item.patterns) {
          if (Object.prototype.hasOwnProperty.call(excludes, p)) {
            excludes[p] = hidden;
          }
        }
      } else {
        excludes[item.pattern] = hidden;
      }
    }
    await setUserExcludes(excludes);
  });

  /* ---- pattern commands ---- */

  const add = vscode.commands.registerCommand('quickHide.add', async () => {
    const excludes = getUserExcludes();
    const pattern = await promptPattern(excludes);
    if (!pattern) return;
    excludes[pattern] = true;
    await setUserExcludes(excludes);
  });

  const edit = vscode.commands.registerCommand(
    'quickHide.edit',
    async (item) => {
      const oldPattern = item && item.pattern;
      if (!oldPattern) return;
      const excludes = getUserExcludes();
      const next = await vscode.window.showInputBox({
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
      const newPattern = next && next.trim();
      if (!newPattern || newPattern === oldPattern) return;

      // rename key in excludes, preserving order
      const rebuilt = {};
      for (const [k, v] of Object.entries(excludes)) {
        rebuilt[k === oldPattern ? newPattern : k] = v;
      }
      await setUserExcludes(rebuilt);

      // keep any group membership pointing at the new name
      const groups = getGroups();
      let touched = false;
      for (const name of Object.keys(groups)) {
        const i = groups[name].indexOf(oldPattern);
        if (i !== -1) {
          groups[name][i] = newPattern;
          touched = true;
        }
      }
      if (touched) await setGroups(groups);
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
      await dropFromAllGroups(pattern);
    }
  );

  /* ---- group membership ---- */

  const assignToGroup = vscode.commands.registerCommand(
    'quickHide.assignToGroup',
    async (item) => {
      const pattern = item && item.pattern;
      if (!pattern) return;
      const groups = getGroups();
      const names = Object.keys(groups).sort((a, b) => a.localeCompare(b));

      const NEW = '$(add) New group…';
      const picks = names
        .filter((n) => n !== item.group)
        .map((n) => ({ label: '$(folder) ' + n, name: n }))
        .concat([{ label: NEW, name: null }]);

      const choice = await vscode.window.showQuickPick(picks, {
        title: `Move "${pattern}" to group`,
      });
      if (!choice) return;

      let target = choice.name;
      if (target === null) {
        target = await promptGroupName(groups);
        if (!target) return;
        groups[target] = [];
      }

      // remove from any current group, add to target
      for (const n of Object.keys(groups)) {
        groups[n] = groups[n].filter((p) => p !== pattern);
      }
      groups[target].push(pattern);
      await setGroups(groups);
    }
  );

  const removeFromGroup = vscode.commands.registerCommand(
    'quickHide.removeFromGroup',
    async (item) => {
      if (!item || !item.pattern) return;
      await dropFromAllGroups(item.pattern);
    }
  );

  /* ---- group commands ---- */

  const addGroup = vscode.commands.registerCommand(
    'quickHide.addGroup',
    async () => {
      const groups = getGroups();
      const name = await promptGroupName(groups);
      if (!name) return;
      groups[name] = [];
      await setGroups(groups);
    }
  );

  const addToGroup = vscode.commands.registerCommand(
    'quickHide.addToGroup',
    async (item) => {
      const groupName = item && item.groupName;
      if (!groupName) return;
      const excludes = getUserExcludes();
      const pattern = await promptPattern(excludes);
      if (!pattern) return;

      excludes[pattern] = true;
      await setUserExcludes(excludes);

      const groups = getGroups();
      for (const n of Object.keys(groups)) {
        groups[n] = groups[n].filter((p) => p !== pattern);
      }
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(pattern);
      await setGroups(groups);
    }
  );

  const renameGroup = vscode.commands.registerCommand(
    'quickHide.renameGroup',
    async (item) => {
      const oldName = item && item.groupName;
      if (!oldName) return;
      const groups = getGroups();
      const next = await vscode.window.showInputBox({
        title: 'Rename group',
        value: oldName,
        validateInput: (raw) => {
          const v = (raw || '').trim();
          if (!v) return 'Name cannot be empty';
          if (
            v !== oldName &&
            Object.prototype.hasOwnProperty.call(groups, v)
          ) {
            return 'A group with that name already exists';
          }
          return null;
        },
      });
      const newName = next && next.trim();
      if (!newName || newName === oldName) return;

      const rebuilt = {};
      for (const [k, v] of Object.entries(groups)) {
        rebuilt[k === oldName ? newName : k] = v;
      }
      await setGroups(rebuilt);
    }
  );

  const deleteGroup = vscode.commands.registerCommand(
    'quickHide.deleteGroup',
    async (item) => {
      const name = item && item.groupName;
      if (!name) return;
      const groups = getGroups();
      delete groups[name]; // patterns survive; they just become ungrouped
      await setGroups(groups);
    }
  );

  const refresh = vscode.commands.registerCommand('quickHide.refresh', () =>
    provider.refresh()
  );

  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION) || e.affectsConfiguration(GROUPS)) {
      provider.refresh();
    }
  });

  context.subscriptions.push(
    treeView,
    add,
    edit,
    remove,
    assignToGroup,
    removeFromGroup,
    addGroup,
    addToGroup,
    renameGroup,
    deleteGroup,
    refresh,
    configWatcher
  );
}

/* ------------------------------------------------------------------ */
/* small shared prompts/util                                           */
/* ------------------------------------------------------------------ */

function promptPattern(excludes) {
  return vscode.window
    .showInputBox({
      title: 'Add files.exclude pattern',
      prompt: 'Glob pattern to hide. Added as hidden (true) by default.',
      placeHolder: 'e.g. **/.turbo  or  **/dist',
      validateInput: (raw) => {
        const v = (raw || '').trim();
        if (!v) return 'Pattern cannot be empty';
        if (Object.prototype.hasOwnProperty.call(excludes, v)) {
          return 'That pattern already exists';
        }
        return null;
      },
    })
    .then((v) => (v ? v.trim() : undefined));
}

function promptGroupName(groups) {
  return vscode.window
    .showInputBox({
      title: 'Group name',
      placeHolder: 'e.g. Lockfiles, Build output, Dotfiles',
      validateInput: (raw) => {
        const v = (raw || '').trim();
        if (!v) return 'Name cannot be empty';
        if (Object.prototype.hasOwnProperty.call(groups, v)) {
          return 'A group with that name already exists';
        }
        return null;
      },
    })
    .then((v) => (v ? v.trim() : undefined));
}

async function dropFromAllGroups(pattern) {
  const groups = getGroups();
  let touched = false;
  for (const n of Object.keys(groups)) {
    const next = groups[n].filter((p) => p !== pattern);
    if (next.length !== groups[n].length) {
      groups[n] = next;
      touched = true;
    }
  }
  if (touched) await setGroups(groups);
}

function deactivate() {}

module.exports = { activate, deactivate };
