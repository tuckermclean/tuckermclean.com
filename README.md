# tuckermclean.com

This repository contains the source code for tuckermclean.com, a personal website that combines a modern web application with a Hugo-based blog section.

## Project Structure

```
tuckermclean.com/
├── src/                        # Source code directory
├── public/                     # Static assets
├── writings/                   # Hugo-based blog/writings section
│   ├── assets/                # Hugo assets
│   ├── layouts/               # Hugo layouts
│   ├── static/                # Static files for Hugo
│   ├── resources/             # Hugo resources
│   ├── themes/                # Hugo themes (git submodule)
│   ├── content/               # Blog content
│   ├── build.js              # Custom build script
│   └── hugo.toml             # Hugo configuration
├── dist/                      # Build output directory
└── [various config files]     # Configuration files
```

## Prerequisites

- Node.js (v18 or later)
- Hugo (Extended version)
- AWS Account (for deployment)

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/tuckermclean/tuckermclean.com.git
   cd tuckermclean.com
   ```

2. Initialize Hugo theme submodules:
   ```bash
   git submodule update --init --recursive
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Building the Project

The project uses a combination of Vite and Hugo for building:

```bash
npm run build
```

This command:
1. Builds the main site using Vite
2. Builds the writings section using Hugo
3. Outputs everything to the `dist` directory

## Deployment

The site is automatically deployed to AWS S3 using GitHub Actions when changes are pushed to the `master` branch. The deployment process requires the following secrets to be configured in the GitHub repository:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET_NAME`

### Manual Deployment

If you need to deploy manually, you can:

1. Build the project:
   ```bash
   npm run build
   ```

2. Deploy to S3:
   ```bash
   aws s3 sync ./dist s3://your-bucket-name
   ```

## Project Components

### Main Website
- Built with Vite
- Modern web application structure
- Includes authentication system
- Chat interface

### Blog/Writings Section
- Powered by Hugo
- Content managed through Markdown files
- Custom themes and layouts
- Integrated with the main site

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

All blog content © 2025 Tucker McLean — licensed under [CC BY‑SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
All code © 2025 Tucker McLean — licensed under the [MIT License](/LICENSE)

## Contact

Direct all love notes and hate mail to Tucker McLean; me@tuckermclean.com