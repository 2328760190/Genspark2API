import crypto from 'crypto'

export const doubleEncode = (str) => {
  return encodeURIComponent(encodeURIComponent(str))
}

export const isValidJSON = (str) => {
  try {
    JSON.parse(str)
    return true
  } catch (e) {
    return false
  }
}

export const sleep = async (ms) => {
  return await new Promise(resolve => setTimeout(resolve, ms))
}

export const getMessageId = async () => {
  const uuid = await crypto.randomUUID()
  return uuid
}

