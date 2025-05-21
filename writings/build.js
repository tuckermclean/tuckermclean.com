import { execSync } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';

console.log('Cleaning dist/writings...');
rmSync(join(process.cwd(), 'dist', 'writings'), { recursive: true, force: true });

console.log('Building Hugo site...');

try {
    execSync('hugo --minify --destination ../dist/writings', { 
        cwd: './writings',
        stdio: 'inherit'
    });
    console.log('Hugo site built successfully');
} catch (error) {
    console.error('Error building Hugo site:', error);
    process.exit(1);
} 