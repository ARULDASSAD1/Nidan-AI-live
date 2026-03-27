/** @type {import('next').NextConfig} */
const nextConfig = {
  // 🌟 HACKATHON OVERRIDE: Allows your mobile phone to download styles and fonts
  allowedDevOrigins: [
    '192.168.222.1', 
    'http://192.168.222.1:3000'
  ],
};

export default nextConfig;