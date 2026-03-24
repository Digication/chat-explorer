# Claude Blueprint

A Claude Code blueprint that adapts to how you work — remembers your preferences, explains things at your level, and guides you through your project safely.

---

## Prerequisites

Before anything else, make sure you have this installed:

- **Claude Code** — [claude.com/claude-code](https://claude.com/claude-code) (the VS Code extension or CLI)

That's all you need. Claude handles the rest.

---

## Getting started

### Step 1: Fork this repo

Click **Fork** at the top of this GitHub page to copy this project into your own account. That gives you your own version to build on.

Then clone it to your computer and open it in VS Code.

### Step 2: Onboard yourself

Open the project in Claude Code and say:

> **You:** `onboard me`

Claude will ask three quick questions — your experience level, what you're building, and how you like to communicate. It saves your answers so it remembers you every time you come back.

> **Want to adjust it later?** Just say `onboard me` again. Claude will show your current settings and let you change just your comfort level, or redo everything from scratch.

---

## What working with this looks like

Once you're onboarded, just talk to Claude naturally. You don't need to memorize any commands — Claude watches for the right moment and offers to help. Here are some examples of what that looks like day-to-day.

---

### Starting a brand new app

> **You:** I want to build a todo app with a React frontend and a Node backend

> **Claude:** Great starting point. Before I write any code, let me put together a plan — what pages you'll need, how the frontend and backend will talk to each other, and how it'll run locally. Want to see the plan first?

For bigger projects (touching many files), Claude automatically creates a step-by-step plan and walks you through it. For smaller changes, it just gets to work.

---

### Adding a feature

> **You:** I want to add a login page to my app

> **Claude:** This touches a few different parts of the project — I'd like to put together a quick plan before we start building, so nothing gets missed. Want me to do that first?

Claude figures out how complex the work is and decides whether to plan first or jump straight in.

---

### Saving your work

> **You:** That looks great, save it

> **Claude:** Everything's ready. Want me to save this with a description of what we did?

Say yes and Claude writes a clear save message, summarizes the changes, and saves everything — no git knowledge needed.

---

### Picking up where you left off

> **You:** I want to start working on the settings page

> **Claude:** Before we start — you have some unsaved changes from the login page we were working on earlier. Want me to save those first so nothing gets lost?

Claude notices when you have unfinished work and offers to tuck it away safely before you move on. When you're ready to come back, just say "let me pick up where I left off" and Claude brings everything back.

---

### When Claude isn't sure about something

> **Claude:** This library should support streaming responses out of the box...

> **You:** Are you sure about that?

> **Claude:** Good question — let me double-check. I verified the docs, and actually that feature was added in v3.2. You're on v3.0, so we'd need to upgrade first. Here's what that involves...

If Claude hedges ("I think...", "usually...") or you question something, it automatically verifies the claim against actual code, docs, or project files before continuing.

---

### After a long back-and-forth

> **You:** We've been going back and forth on this a lot — did we get it right?

> **Claude:** Good idea to take a step back. Let me bring in a fresh perspective to review the decisions we've made...

When a conversation has had a lot of discussion, Claude can do an independent review of all the decisions and flag anything that might need a second look.

---

### Learning from how you work

After finishing a task, Claude may notice it learned something useful from your working style:

> **Claude:** I learned something from how we worked today — you prefer keeping test files next to the code they test. Want me to remember that for next time?

Say yes, and Claude will apply that preference in future conversations — so you never have to repeat yourself.

---

### Changing how Claude talks to you

If Claude's style ever feels off — too detailed, not detailed enough, too cautious — just say so:

> **You:** You're explaining too much, I just want the short version

> **Claude:** Got it. Here's your current setup — want me to adjust your comfort level so I'm more concise going forward?

Claude shows your current profile and lets you tweak it. You can also say `onboard me` anytime to redo the full setup.

