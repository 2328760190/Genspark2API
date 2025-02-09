import 'dotenv/config'
import express from 'express'
import bodyParser from 'body-parser'
import { models, imageModels } from './models.js'
import AccountManager from './account.js'
import config from './config.js'
import { isValidJSON, getMessageId } from './utils.js'
import { makeRequest, SendImageRequest } from './requestAPI.js'

const app = express()

// 使用 bodyParser 中间件
app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }))
app.use(bodyParser.text({ limit: '50mb' }))

app.post(config.apiPath + '/v1/chat/completions', async (req, res) => {
  let { messages, stream = false, model = 'claude-3-5-sonnet-20241022' } = req.body
  const authHeader = req.headers['authorization'] || ''
  let apiKey = authHeader.replace('Bearer ', '')

  if (!apiKey || apiKey == "" || apiKey !== config.apiKey) {
    return res.status(401).json({ error: '未提供有效的 apiKey' })
  }

  const account = AccountManager.getAccount()
  const session_id = account.session_id
  let project_start = null


  try {
    // 初始化请求
    let response = null
    // 设置返回响应时的id
    const messageId = await getMessageId()

    // 设置流式响应
    if (stream === "true" || stream === true) {
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })
    } else {
      res.set({
        'Content-Type': 'application/json',
      })
    }

    // 聊天接口处理图片请求
    if (imageModels[model]) {
      // console.log(session_id, messages[messages.length - 1].content, model)

      const imageUrls = await SendImageRequest(session_id, messages[messages.length - 1].content, model)
      console.log(imageUrls)
      if (imageUrls.length == 0) {
        return res.status(500).json({ error: '请求失败' })
      }

      let imageUrlsContent = ''
      imageUrls.forEach(item => {
        imageUrlsContent += `![image](${item})\n`
      })

      if (stream === "true" || stream === true) {

        res.write(`data: ${JSON.stringify({
          "id": `chatcmpl-${messageId}`,
          "choices": [
            {
              "index": 0,
              "delta": {
                "content": imageUrlsContent
              }
            }
          ],
          "created": Math.floor(Date.now() / 1000),
          "model": models[`${model}`],
          "object": "chat.completion.chunk"
        })}\n\n`)
        res.write('data: [DONE]\n\n')
        return
      } else {

        res.json({
          id: `chatcmpl-${messageId}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: imageUrlsContent,
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: imageUrlsContent.length,
          },
        })
      }

      return

    } else {
      // 正常聊天的请求
      response = await makeRequest(account, model, messages)
      if (!response) {
        return res.status(500).json({ error: '请求失败' })
      }
    }

    // 如果请求模型为o3-mini，并且请求模式为流式响应，则改为非流
    if (model == "o3-mini" && stream === "true" || stream === true) {
      stream = false
    }

    // 从流式响应中获取数据
    const reader = response.body.getReader()

    try {
      // 保存非流式响应的数据
      let resBody = {}

      // 读取流式响应
      while (true) {
        const { done, value } = await reader.read()
        // 如果流式响应结束，则结束
        if (done) {
          // 如果流式响应结束，则发送流式响应结束的信号
          if (stream === "true" || stream === true) {
            res.write('data: [DONE]\n\n')
          }
          break
        }

        if (stream) {
          // 流式响应
          const text = new TextDecoder().decode(value)
          // console.log("----------------------------------------------\n", text, "\n----------------------------------------------")
          const textContent = [...text.matchAll(/data:.*"}/g)]

          textContent.forEach(item => {
            // console.log("----------------------------------------------\n", item[0], "\n----------------------------------------------")
            let content = item[0].replace("data: ", '').trim()
            if (!item[0] || !isValidJSON(content)) {
              return
            }
            content = JSON.parse(content)
            // console.log(content)
            if (content.type == "project_start") {
              project_start = content.id
            }

            if (!content || content.delta == undefined || content.delta == null) {
              return
            }

            res.write(`data: ${JSON.stringify({
              "id": `chatcmpl-${messageId}`,
              "choices": [
                {
                  "index": 0,
                  "delta": {
                    "content": content.delta
                  }
                }
              ],
              "created": Math.floor(Date.now() / 1000),
              "model": models[`${model}`],
              "object": "chat.completion.chunk"
            })}\n\n`)

          })

        } else {
          // 非流式响应

          const text = new TextDecoder().decode(value)
          const textContent = [...text.matchAll(/data:.*"}/g)]

          textContent.forEach(item => {
            if (!item[0] || !isValidJSON(item[0].replace("data: ", ''))) {
              return
            }
            const content = JSON.parse(item[0].replace("data: ", ''))

            if (content.type == "project_start") {
              project_start = content.id
            }

            if (!content || !content?.field_value || content?.field_name === 'session_state.answer_is_finished' || content?.field_name === 'content' || content?.field_name === "_updatetime" || content?.field_name === 'session_state' || content?.delta || content?.type === 'project_field') {
              return
            }
            resBody = {
              id: `chatcmpl-${messageId}`,
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: content.field_value,
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: content.field_value.length,
              },
            }
          })

        }

      }

      if (project_start) {
        account.deleteMessage(project_start)
      }

      if (stream === "false" || stream === false) {
        if (model == "o3-mini") {
          res.write(`data: ${JSON.stringify(resBody)}\n\n`)
          res.end()
        } else {
          res.json(resBody)
        }
      } else {
        res.end()
      }



      return

    } catch (error) {
      console.error('流式响应出错:', error)
      res.end()
    }

  } catch (error) {
    console.error('请求处理出错:', error)
    res.status(500).json({ error: '请求处理失败' })
  }
})

app.post(config.apiPath + '/v1/images/generations', async (req, res) => {
  const { prompt, n = 1, size = "1:1", model = "dall-e-3" } = req.body
  const authHeader = req.headers['authorization'] || ''
  let apiKey = authHeader.replace('Bearer ', '')

  if (!apiKey || apiKey !== config.apiKey || apiKey == "") {
    return res.status(401).json({ error: '未提供有效的 apiKey' })
  }

  const account = AccountManager.getAccount()
  const session_id = account.session_id

  const imageUrls = await SendImageRequest(session_id, prompt, model, "1:1", "auto")
  res.json({
    created: Math.floor(Date.now() / 1000),
    data: imageUrls.map(item => {
      return {
        url: item
      }
    })
  })

})

// 获取 models
app.get(config.apiPath + '/v1/models', (req, res) => {
  res.json({
    object: "list",
    data: Object.keys(models).map(model => ({
      id: model,
      object: "model",
      created: 1706745938,
      owned_by: "genspark"
    }))
  })
})

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('全局错误:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message
  })
})

app.get('/', (req, res) => {
  res.json({
    status: true,
    message: 'Genspark2API is running'
  })
})



app.post(config.apiPath + '/add_account', async (req, res) => {
  const authHeader = req.headers['authorization'] || ''
  let apiKey = authHeader.replace('Bearer ', '')
  if (apiKey != config.apiKey || apiKey == "") {
    return res.status(401).json({ error: '未提供有效的 apiKey' })
  }

  const result = await AccountManager.addAccount(req.body)
  if (result) {
    res.json({
      status: true,
      message: '账号添加成功!'
    })
  } else {
    res.json({
      status: false,
      message: '账号添加失败!'
    })
  }

})

// 启动服务器
app.listen(config.port, () => {
  console.log(`服务器运行在 http://localhost:${config.port}`)
})