const config = {
  port: process.env.PORT || 8666,
  apiKey: process.env.API_KEY || "sk-123456",
  apiPath: process.env.API_PATH || "",
  imageWaitTime: process.env.IMAGE_WAIT_TIME || 25000,
  imageCount: process.env.IMAGE_COUNT || 1,
  proxy: {
    mode: process.env.PROXY_MODE || "0",
    url: process.env.PROXY_URL || "",
    apiKey: process.env.PROXY_API || "",
  }
}

export default config