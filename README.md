# Quick Hide

A tiny VS Code extension that adds a **Quick Hide** section to the Explorer (right
under NPM Scripts) for managing your `files.exclude` patterns without ever opening
`settings.json`.

![placeholder](https://via.placeholder.com/600x200?text=Quick+Hide)

## What it does

- Lists every pattern from your **user** `files.exclude` settings.
- Each row has a **checkbox**:
  - **checked** = pattern is hidden (`true`)
  - **unchecked** = pattern is visible (`false`)
- **Add** button (`+` in the view title) to type a new glob. It's added as
  hidden (`true`) by default.
- **Edit** (pencil) and **Remove** (trash) actions appear inline on each row.

All changes are written to your **user settings** (global), matching how you
normally edit `files.exclude` by hand.

## Why "user settings" only

The view reads `inspect('files.exclude').globalValue`, so it shows and edits only
the patterns *you* added — never VS Code's built-in defaults like `**/.git`. That
keeps your `settings.json` clean.

## Install locally

```sh
npm install
npm run package          # produces quick-hide-<version>.vsix
code --install-extension quick-hide-0.0.1.vsix
```

Then reload VS Code. Open the Explorer and look for the **Quick Hide** section.

## Develop

Open this folder in VS Code and press `F5` to launch an Extension Development Host.
