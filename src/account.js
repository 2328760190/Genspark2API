import config from "./config.js"
import fs from 'fs'
import getProxyAgent from './proxy.js'
import { isValidJSON } from './utils.js'


class Account {
  constructor(account) {
    this.session_id = account.session_id
    this.recaptcha_token = account.recaptcha_token
    this.recaptcha_file = account.recaptcha_file
  }

  async getRecaptchaToken() {
    try {
      const myHeaders = {
        "content-type": "application/x-protobuffer",
      }

    const response = await fetch(`https://www.google.com/recaptcha/api2/reload?k=${this.recaptcha_token}`, {
      method: 'POST',
      headers: myHeaders,
      redirect: 'follow',
      agent: await getProxyAgent(),
      body: fs.readFileSync(`./data/recaptcha/${this.recaptcha_file}`)
    })

    let data = await response.text()
    data = data.replace(")]}'", "")
    if (isValidJSON(data)) {
      const jsonData = JSON.parse(data)[1]
      // console.log(jsonData)
      return jsonData
      } else {
        return null
      }
    } catch (e) {
      return null
    }
  }

  async deleteMessage(project_id) {
    try {
      const myHeaders = {
        "Cookie": `session_id=${this.session_id}`,
        "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
        "Content-Type": "application/json",
        "Accept": "*/*",
        "Host": "www.genspark.ai",
        "Connection": "keep-alive"
      }

      const requestConfig = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow',
        agent: await getProxyAgent()
      }

      return await fetch(`https://www.genspark.ai/api/project/delete?project_id=${project_id}`, requestConfig)
    } catch (error) {
      console.log('error3', error)
      return false
    }
  }
}

class AccountManager {
  constructor() {
    this.accounts = []
    this._accounts = []
    this.index = 0
    this.init()
  }

  init() {
    let accounts = fs.readFileSync('./data/account.json', 'utf-8')
    accounts = JSON.parse(accounts).accounts
    for (let account of accounts) {
      this.accounts.push(new Account(account))
      this._accounts.push(account)
    }
    console.log("账号初始化成功: => 共", this.accounts.length, "个")
    console.log(this._accounts)
    return
  }

  addAccount(account) {
    try {
      if (!account.session_id || account.session_id == "") {
        console.log("账号添加失败：", account, "\n------------------------------------------------\n")
        return false
      }

      this.accounts.push(new Account(account))
      this._accounts.push(account)
      fs.writeFileSync('./data/account.json', JSON.stringify({ accounts: this._accounts }))

      console.log("账号添加成功：", account, "\n------------------------------------------------\n")
      console.log("当前账号库：", this._accounts, "\n------------------------------------------------\n")
      return true
    } catch (e) {
      return false
    }
  }

  getAccount() {
    const account = this.accounts[this.index]
    this.index++
    if (this.index >= this.accounts.length) {
      this.index = 0
    }
    return account
  }

}

const accountManager = new AccountManager()

export default accountManager