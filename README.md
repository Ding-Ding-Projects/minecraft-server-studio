# Minecraft Server Studio dashboard

This directory contains a standalone, static companion dashboard for Minecraft Server Studio. It is designed to be hosted as a Sites-compatible local-first dashboard and has no backend, external assets, analytics, network requests, installer, shell access, or server process control.

The dashboard lets a person assemble a Paper or Spigot server recipe, select a Minecraft release and resource controls, acknowledge automatic dependency setup, draft configuration, prepare console commands, and choose local plugin JAR files for later desktop-app hand-off.

Automatic installation is deliberately represented as a desktop application capability: the connected desktop app is responsible for resolving Java, verifying and downloading the chosen server distribution, creating files, validating plugins, and launching the process. The static page makes no claim to carry out those operations itself.

## Source files

- `index.html` contains the accessible dashboard structure and rich controls.
- `styles.css` provides a responsive Material-inspired visual system with a dark and light theme.
- `app.js` provides client-only interactions, local session feedback, plan previews, command composition, and file-selection staging.
- `.openai/hosting.json` declares that the site does not need database or object-storage bindings.

## GitHub Pages hand-off

The exact static publish source is the repository-relative `site/` directory; its entry point is `site/index.html`. A Pages workflow can upload that directory as its artifact without a separate build step. The included `.nojekyll` marker keeps Pages from attempting Jekyll processing, while the Sites declaration remains scoped inside this directory and does not require a backend binding.

The published page must retain the local-demo boundary: it presents planning and local file-selection controls only, and it does not claim to install dependencies, download server distributions, create server files, start processes, or upload plugins.
