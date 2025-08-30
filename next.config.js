const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost', 'commondatastorage.googleapis.com', 'pub-a0da9daa5c8a415793ac89043f791f12.r2.dev'],
  },
}

module.exports = withNextIntl(nextConfig);