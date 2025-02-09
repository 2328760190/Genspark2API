import getProxyAgent from './proxy.js'
import { isValidJSON, sleep, getMessageId } from './utils.js'
import { models, imageModels } from './models.js'

export const getImageUrl = async (session_id, task_id) => {
  const myHeaders = {
    "Cookie": `session_id=${session_id}`,
    "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
    "Content-Type": "application/json",
    "Accept": "*/*",
    "Host": "www.genspark.ai",
    "Connection": "keep-alive"
  }

  const reqConfig = {
    method: 'GET',
    headers: myHeaders,
    redirect: 'follow',
    agent: await getProxyAgent()
  }
  const startTime = Date.now()
  while (true) {
    try {
      const url = await fetch(`https://www.genspark.ai/api/spark/image_generation_task_status?task_id=${task_id}`, reqConfig)
      const urlContent = await url.json()
      // console.log(3, urlContent.data.status)
      if (urlContent.data.status == "SUCCESS") {
        return urlContent.data.image_urls_nowatermark[0]
      } else {
        if (Date.now() - startTime > config.imageWaitTime || urlContent.data.status == "FAILURE") {
          return null
        }
        await sleep(1000)
      }
    } catch (e) {
      return null
    }
  }

}

export const SendImageRequest = async (session_id, content, model = "dall-e-3", size = "1:1", style = "auto") => {
  const myHeaders = {
    "Cookie": `session_id=${session_id}`,
    "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
    "Content-Type": "application/json",
    "Accept": "*/*",
    "Host": "www.genspark.ai",
    "Connection": "keep-alive"
  }

  const sizeArray = ["auto", "9:16", "2:3", "3:4", "1:1", "4:3", "3:2", "16:9"]
  /* 
  auto: 自动
  realistic_image: 写实
  cartoon: 卡通
  watercolor: 水彩
  anime: 动漫
  oil_painting: 油画
  3d: 3D
  minimalist: 极简
  pop_art: 波普艺术
  */
  const styleArray = ["auto", "realistic_image", "cartoon", "watercolor", "anime", "oil_painting", "3d", "minimalist", "pop_art"]

  size = sizeArray.includes(size) ? size : "auto"
  style = styleArray.includes(style) ? style : "auto"

  const body = JSON.stringify({
    "type": "COPILOT_MOA_IMAGE",
    "current_query_string": "type=COPILOT_MOA_IMAGE",
    "messages": [
      {
        "role": "user",
        "content": content
      }
    ],
    "action_params": {},
    "extra_data": {
      "model_configs": [
        {
          "model": imageModels[model] || imageModels["dall-e-3"],
          "aspect_ratio": size,
          "use_personalized_models": false,
          "fashion_profile_id": null,
          "hd": false,
          "reflection_enabled": false,
          "style": style
        }
      ],
      "imageModelMap": {},
      "writingContent": null
    }
  })

  const requestConfig = {
    method: 'POST',
    headers: myHeaders,
    body: body,
    redirect: 'follow',
    agent: await getProxyAgent()
  }

  const imageResponse = await fetch("https://www.genspark.ai/api/copilot/ask", requestConfig)

  const imageStream = imageResponse.body.getReader()
  const imageTaskIDs = []

  while (true) {
    const { done, value } = await imageStream.read()
    if (done) {
      break
    }

    const text = new TextDecoder().decode(value)
    const textContent = [...text.matchAll(/data:.*"}/g)]
    for (const item of textContent) {
      if (!item[0] || !isValidJSON(item[0].replace("data: ", ''))) {
        continue
      }
      let content = JSON.parse(item[0].replace("data: ", ''))
      if (content.type != 'message_result') {
        continue
      }
      const urlIDs = JSON.parse(content.content).generated_images.map(item => item.task_id)
      imageTaskIDs.push(...urlIDs)
    }
  }

  // console.log(1,imageTaskIDs)

  if (imageTaskIDs.length > 0) {
    const imageUrls = []
    for (const item of imageTaskIDs) {
      const url = await getImageUrl(session_id, item)
      // console.log(2, url)
      if (url) {
        imageUrls.push(url)
      }
      if (imageUrls.length >= config.imageCount) {
        break
      }
    }
    return imageUrls
  } else {
    return []
  }

}

export const makeRequest = async (account, requestModel, messages) => {
  try {
    // console.log(1, account)
    const session_id = await account.session_id

    console.log("发送请求：", session_id, `${requestModel} => ${models[requestModel] || models["claude-3-5-sonnet-20241022"]}`)

    const myHeaders = {
      "Cookie": `session_id=${session_id}`,
      "Content-Type": "application/json",
      "Accept": "*/*",
      "Host": "www.genspark.ai",
      "Connection": "keep-alive",

    }

    // // messages = messages.filter(item => item.role == "user" || item.role == "assistant")
    // messages = messages.map(item => {
    //   if (item.role == "assistant") {
    //     item.session_state = {
    //       "models": [
    //         models[requestModel] || models["claude-3-5-sonnet-20241022"]
    //       ],
    //       "layers": 2,
    //       "answer": item.content,
    //       "answer_is_finished": true
    //     }
    //   } else if (item.role == "user") {
    //     item.session_state = null
    //   }

    //   item.thinking = false
    //   item.is_prompt = false
    //   // item.id = null
    //   item.action = null
    //   item.recommend_actions = null
    //   item.render_template = null
    //   item.type = "message_result"

    //   return item
    // })

    const body = JSON.stringify({
      "type": "COPILOT_MOA_CHAT",
      "current_query_string": `type=COPILOT_MOA_CHAT`,
      "messages": [{
        "role": "user",
        "content": `
            <input>标签中是用户输入的内容：

            <input>
            ${messages[messages.length - 1].content}
            </input>

            -----------------------------------------
            以下是上个模型与用户的的聊天记录：
            -----------------------------------------
            ${JSON.stringify(messages)}
            -----------------------------------------
            `
      }],

      "user_s_input": messages[messages.length - 1].content,
      "action_params": {},

      "extra_data": {
        "models": [
          models[requestModel] || models["claude-3-5-sonnet-20241022"]
        ],
        "run_with_another_model": false,
        "request_web_knowledge": false,
        "writingContent": null
      },
      "g_recaptcha_token": await account.getRecaptchaToken()
    })

    const requestConfig = {
      method: 'POST',
      headers: myHeaders,
      body: body,
      redirect: 'follow',
      agent: await getProxyAgent()
    }

    return await fetch("https://www.genspark.ai/api/copilot/ask", requestConfig)
  } catch (error) {
    console.log('error1', error)
    throw error
  }
}