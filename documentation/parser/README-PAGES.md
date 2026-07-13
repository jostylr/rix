# RiX Language Parser - GitHub Pages Documentation

This folder contains the documentation website for the RiX Language Parser, designed to be served via GitHub Pages.

## Overview

The documentation site includes:
- **Static HTML pages** generated from Markdown documentation
- **Interactive demo** for testing the parser in real-time
- **Responsive design** that works on desktop and mobile devices
- **Relative paths** throughout to ensure it works both locally and on GitHub Pages

## Structure

```
docs/
├── src/                    # Source files for JavaScript
│   └── demo.js            # Demo page source (to be compiled)
├── *.md                   # Markdown documentation files
├── *.html                 # Generated HTML files
├── index.html             # Home page
├── demo.html              # Interactive parser demo
├── demo.js                # Compiled demo JavaScript
├── demo.css               # Demo page styles
├── template.html          # HTML template for markdown pages
├── build-docs.js          # Build script for documentation
├── _config.yml            # Jekyll configuration (if using Jekyll)
└── .nojekyll              # Disable Jekyll processing
```

## Building the Documentation

### Prerequisites
- Node.js or Bun runtime
- Dependencies installed (`bun install` or `npm install`)

### Build Commands

```bash
# Build the demo JavaScript
bun run build:demo

# Build HTML from Markdown files
bun run build:docs

# Build everything
bun run build:all

# Watch mode for demo development
bun run dev:demo
```

## Setting up GitHub Pages

1. **Enable GitHub Pages** in your repository settings:
   - Go to Settings → Pages
   - Source: Deploy from a branch
   - Branch: Select your main/master branch
   - Folder: Select `/docs`
   - Click Save

2. **Access your site** at:
   ```
   https://[your-username].github.io/[repository-name]/
   ```

## Local Development

To test the site locally:

1. **Using Python (simple HTTP server)**:
   ```bash
   cd docs
   python -m http.server 8000
   ```
   Then visit `http://localhost:8000`

2. **Using Node.js**:
   ```bash
   npx http-server docs -p 8000
   ```

3. **Using Bun**:
   ```bash
   cd docs
   bun --bun run -e "Bun.serve({ fetch(req) { return new Response(Bun.file(new URL(req.url).pathname.slice(1) || 'index.html')); }, port: 8000 })"
   ```

## Adding New Documentation

1. **Create a new Markdown file** in the `docs/` folder
2. **Run the build script**:
   ```bash
   bun run build:docs
   ```
3. **Update the navigation** in `template.html` if needed
4. **Commit and push** to see changes on GitHub Pages

## Customization

### Styling
- Main styles are in `template.html` for documentation pages
- Demo-specific styles are in `demo.css`
- Modify CSS variables in `:root` for theme customization

### Demo Features
The demo page includes:
- **Real-time parsing** of RiX expressions
- **AST visualization** with expandable tree view
- **Token display** showing lexical analysis
- **Error reporting** with helpful diagnostics
- **Modal view** for detailed node inspection

### Navigation
Update the sidebar links in `template.html` to add or modify documentation sections.

## Troubleshooting

### Pages not updating
- GitHub Pages can take a few minutes to update
- Check Actions tab for deployment status
- Ensure `.nojekyll` file exists to prevent Jekyll processing

### JavaScript not loading
- Make sure to run `bun run build:demo` after changes
- Check browser console for errors
- Verify paths are relative to the repository name

### Broken links
- All internal links use relative paths (like `./` and `../`)
- Avoid absolute paths starting with `/` which would break local testing
- Test the site both locally and on GitHub Pages to ensure links work in both environments

## Contributing

When adding new features or documentation:
1. Follow the existing file naming conventions
2. Update navigation in relevant HTML files
3. Test locally before pushing
4. Ensure responsive design is maintained
5. Run all build scripts before committing
6. Always use relative paths for links and assets

### Path Guidelines

- For links within the same directory: `./filename.html` or just `filename.html`
- For links to parent directory: `../`
- For assets like images from docs subdirectory: `../asset-name.png`
- For assets from the demo page: `./asset-name.png`

## License

This documentation is part of the RiX Language Parser project and is licensed under the MIT License.