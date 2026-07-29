# Quick Hide

A tiny VS Code extension that adds a **Quick Hide** section to the Explorer (right
under NPM Scripts) for managing your `files.exclude` patterns without ever opening
`settings.json`.

## What it does

- Lists every pattern from your **user** `files.exclude` settings.
- Each row has a **checkbox**:
  - **checked** = pattern is hidden (`true`)
  - **unchecked** = pattern is visible (`false`)
- **Add Pattern** (`+` in the view title) to type a new glob. It's added as
  hidden (`true`) by default.
- **Edit** (pencil) and **Remove** (trash) actions appear inline on each row.

### Groups

You can organize patterns into collapsible **groups** and toggle a whole group
at once:

- **Add Group** (new-folder icon in the view title) creates a group.
- A group's checkbox is **checked only when every pattern in it is hidden**.
  Toggling the group sets all its members to that state in one write.
- On a pattern row, **Move to Group…** (folder icon) assigns it to a group (or
  creates a new one). Grouped patterns get a **Remove from Group** action.
- On a group row: **+** adds a new pattern straight into that group, plus
  rename and delete. Deleting a group never deletes the patterns — they just
  become ungrouped again.

Group definitions live in the `quickHide.groups` user setting (a map of group
name → list of patterns). Like everything else, it's stored in your **user
settings** only; `files.exclude` stays a flat object that any editor understands.

All changes are written to your **user settings** (global), matching how you
normally edit `files.exclude` by hand.

## Why "user settings" only

The view reads `inspect('files.exclude').globalValue`, so it shows and edits only
the patterns _you_ added — never VS Code's built-in defaults like `**/.git`. That
keeps your `settings.json` clean.

## Install

- **Marketplace:** search for **Quick Hide** in the Extensions view, or install
  from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=LukanRocks.quick-hide).
- **From a release:** download the `.vsix` from the
  [latest GitHub release](https://github.com/LukanRocks/vscode-extension-quick-hide/releases/latest)
  and run `code --install-extension quick-hide-<version>.vsix`.

## Build from source

```sh
npm install
npm run package          # produces quick-hide-<version>.vsix
code --install-extension quick-hide-<version>.vsix
```

Then reload VS Code. Open the Explorer and look for the **Quick Hide** section.

## Develop

Open this folder in VS Code and press `F5` to launch an Extension Development Host.
