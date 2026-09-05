// PM2 process manager config. Run all 4 services with: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'auth-service',
      cwd: './services/auth-service',
      script: 'src/index.js',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'todo-service',
      cwd: './services/todo-service',
      script: 'src/index.js',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'api-gateway',
      cwd: './services/api-gateway',
      script: 'src/index.js',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'client',
      cwd: './client',
      script: 'npx',
      args: 'serve -s dist -l 3000',
      env: { NODE_ENV: 'production' }
    }
  ]
};
