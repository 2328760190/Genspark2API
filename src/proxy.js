import config from './config.js'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'

const getProxyAgent = async () => {
  //  配置代理
  let proxyAgent = null

  // 代理配置
  if (config.proxy.mode == "1") {
    if (config.proxy.url.includes("http")) {
      // http://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPort}
      proxyAgent = new HttpsProxyAgent(config.proxy.url)
    } else if (config.proxy.url.includes("socks5")) {
      // socks5://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPort}
      proxyAgent = new SocksProxyAgent(config.proxy.url)
    }
  }

  return proxyAgent
}

export default getProxyAgent