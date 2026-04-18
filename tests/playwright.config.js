const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './specs',
    timeout: 90000,
    retries: 1,
    workers: 1,
    use: {
        baseURL: 'https://mu-aeon-econova-biddingwars.vercel.app',
        headless: true,
        screenshot: 'only-on-failure',
        video: 'off',
    },
    reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
});
