import axios from "axios"

interface WATIMessage {
  phone: string          // with country code, no +
  templateName: string
  variables: Record<string, string>
}

interface WATIResponse {
  result: boolean
  messageId?: string
  info?: string
}

const watiClient = axios.create({
  baseURL: process.env.WATI_API_URL,
  headers: {
    Authorization: `Bearer ${process.env.WATI_API_TOKEN}`,
    "Content-Type": "application/json",
  },
})

export async function sendWhatsAppTemplate(msg: WATIMessage): Promise<WATIResponse> {
  try {
    const phone = msg.phone.replace(/\D/g, "").replace(/^0/, "91")

    const parameters = Object.entries(msg.variables).map(([, value]) => ({
      name: "text",
      text: value,
    }))

    const response = await watiClient.post(
      `/api/v1/sendTemplateMessage?whatsappNumber=${phone}`,
      {
        template_name: msg.templateName,
        broadcast_name: msg.templateName,
        parameters,
      }
    )

    return { result: true, messageId: response.data?.id }
  } catch (error: unknown) {
    const err = error as { message?: string }
    return { result: false, info: err?.message }
  }
}

export async function sendWhatsAppText(phone: string, body: string): Promise<WATIResponse> {
  try {
    const cleaned = phone.replace(/\D/g, "").replace(/^0/, "91")

    const response = await watiClient.post(
      `/api/v1/sendSessionMessage/${cleaned}`,
      { messageText: body }
    )

    return { result: true, messageId: response.data?.id }
  } catch (error: unknown) {
    const err = error as { message?: string }
    return { result: false, info: err?.message }
  }
}
