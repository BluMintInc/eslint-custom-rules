const { execSync } = require('child_process');
require('dotenv').config();

try {
  execSync('npm run release:dry-run', { 
    stdio: 'inherit',
    env: {
      ...process.env,
      CI: 'true',
      GITHUB_REF: 'refs/heads/main'
    } 
  });
} catch (error) {
  console.error('Release dry run failed:', error);
  process.exit(1);
} 