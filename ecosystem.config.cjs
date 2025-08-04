module.exports = {
   apps: [
      {
         // Name shown in `pm2 ls` / `pm2 logs`
         name: 'hagar',

         // Compiled entry point produced by Vite/Rollup
         script: 'dist/main.js',

         // Project root inside the droplet
         cwd: '/root/hagar',

         // Let Node load the production env file at start-up
         node_args: '--env-file=.env.production',

         // PM2 runtime options
         exec_mode: 'fork',          // single process; use "cluster" if you prefer
         restart_delay: 5000,        // wait 5 s before restarting after a crash

         env: {
            NODE_ENV: 'production'
         }
      }
   ]
};