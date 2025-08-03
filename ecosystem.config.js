module.exports = {
  apps: [
    {
      name: 'hagar',
      script: 'dist/main.js',
      // Arguments passed to the Node.js interpreter
      interpreter_args: '--env-file=.env.production',
      // Optional: Restart the app if it uses more than 500MB of memory
      // max_memory_restart: '500M',
    },
  ],
};
