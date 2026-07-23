# Install the CheckHere Agent Skill

The skill lives in [`skills/checkhere`](../skills/checkhere) and follows the open Agent Skills directory format.

## GitHub CLI 2.96+

Install the tagged Skill directly from GitHub for Codex:

```bash
gh skill install Ryan-yang125/checkhere checkhere@v0.4.0 --agent codex --scope user
```

Use `--agent claude-code` for Claude Code. The skill argument is positional in GitHub CLI 2.96; `--skill` is not part of the command syntax.

## Codex

Copy the complete skill directory into the user skill folder:

```bash
mkdir -p "$HOME/.codex/skills"
cp -R skills/checkhere "$HOME/.codex/skills/checkhere"
```

Restart the agent session after installation so it can discover the new skill.

## Claude Code

Install it for the current project:

```bash
mkdir -p .claude/skills
cp -R skills/checkhere .claude/skills/checkhere
```

Use `$HOME/.claude/skills/checkhere` for a user-wide installation.

## Verify the package

The installed directory should retain this structure:

```text
checkhere/
├── SKILL.md
├── evals/
│   └── evals.json
└── references/
    └── report-contract.md
```

Validate from the repository with the Agent Skills reference validator when it is available:

```bash
skills-ref validate ./skills/checkhere
```

The CLI remains a separate local dependency. Install the first public release from its verified GitHub asset, then set up Chromium:

```bash
npm install --global https://github.com/Ryan-yang125/checkhere/releases/download/v0.4.0/checkhere-0.4.0.tgz
checkhere setup
checkhere doctor
```
