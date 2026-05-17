import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useActionData, useLoaderData, useSubmit, useNavigation } from "@remix-run/react"
import { useState, useEffect, useRef } from "react"
import { runMerchantChat } from "@d2c/core"
import { requireShop } from "../lib/shop.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = await requireShop(request)
  return json({ shopId: shop.id, shopName: shop.name ?? "your store" })
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const shop = await requireShop(request).catch(() => null)
  if (!shop) return json({ error: "Shop not found" })

  const body = await request.json() as {
    message: string
    history: Array<{ role: string; content: string }>
  }

  try {
    const reply = await runMerchantChat(
      shop.id,
      body.message,
      body.history as Array<{ role: "user" | "assistant"; content: string }>
    )
    return json({ reply })
  } catch (err) {
    console.error("[chat/action]", err)
    return json({ error: "Failed to get a response. Check that ANTHROPIC_API_KEY is set." })
  }
}

const SUGGESTED_PROMPTS = [
  "Who are my at-risk customers right now?",
  "What's my RTO rate for the last 30 days?",
  "Show me my VIP customers by LTV",
  "How much revenue did I make today?",
  "Which carrier has the highest RTO rate?",
  "How many abandoned carts this week?",
]

type Message = { role: "user" | "assistant" | "error"; content: string }

export default function ChatPage() {
  const { shopName } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const submit = useSubmit()
  const navigation = useNavigation()

  const [message, setMessage] = useState("")
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const [messages, setMessages] = useState<Message[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isLoading = navigation.state === "submitting"

  // Apply incoming reply to messages
  useEffect(() => {
    if (!actionData) return
    if ("reply" in actionData && actionData.reply) {
      setMessages((prev) => [
        ...prev.filter((m) => m.role !== "error"),
        { role: "assistant", content: actionData.reply },
      ])
      setHistory((prev) => [...prev, { role: "assistant", content: actionData.reply }])
    } else if ("error" in actionData && actionData.error) {
      setMessages((prev) => [...prev, { role: "error", content: actionData.error as string }])
    }
  }, [actionData])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    const newMsg: Message = { role: "user", content: trimmed }
    const newHistory = [...history, { role: "user" as const, content: trimmed }]
    setMessages((prev) => [...prev, newMsg])
    setHistory(newHistory)
    setMessage("")
    submit(JSON.stringify({ message: trimmed, history }), {
      method: "POST",
      encType: "application/json",
    })
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send(message)
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f0f13",
      padding: "24px 32px 32px",
      boxSizing: "border-box",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(108,99,255,0.3), 0 0 40px rgba(108,99,255,0.15); }
          50% { box-shadow: 0 0 30px rgba(108,99,255,0.5), 0 0 60px rgba(108,99,255,0.25); }
        }
        @keyframes greenPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        .suggested-btn:hover {
          border-color: rgba(108,99,255,0.6) !important;
          background: rgba(108,99,255,0.08) !important;
        }
        .send-btn:hover:not(:disabled) {
          background: #7c74ff !important;
        }
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>

      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg, #6c63ff, #a78bfa)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            flexShrink: 0,
          }}>
            ✦
          </div>
          <h1 style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: "#e8e8f0",
            letterSpacing: "-0.3px",
          }}>
            AI Chat
          </h1>
          {/* Live data badge */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.25)",
            borderRadius: 20,
            padding: "3px 10px",
            marginLeft: 4,
          }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#22c55e",
              animation: "greenPulse 1.8s ease-in-out infinite",
            }} />
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#22c55e",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}>
              Live data
            </span>
          </div>
        </div>
        <p style={{
          margin: 0,
          fontSize: 14,
          color: "rgba(232,232,240,0.5)",
          paddingLeft: 44,
        }}>
          Ask anything about {shopName} — powered by Claude
        </p>
      </div>

      {/* Chat Container */}
      <div style={{
        height: "calc(100vh - 200px)",
        minHeight: 480,
        display: "flex",
        flexDirection: "column",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        overflow: "hidden",
      }}>
        {/* Messages Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 28px 16px" }}>
          {messages.length === 0 && !isLoading ? (
            /* Empty State */
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 28,
              paddingBottom: 20,
            }}>
              {/* Glowing circle */}
              <div style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #6c63ff, #a78bfa)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
                animation: "glowPulse 2.5s ease-in-out infinite",
              }}>
                ✨
              </div>

              {/* Heading */}
              <div style={{ textAlign: "center" }}>
                <h2 style={{
                  margin: "0 0 10px",
                  fontSize: 24,
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #6c63ff, #a78bfa, #e8e8f0)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  letterSpacing: "-0.4px",
                }}>
                  Your D2C Intelligence Layer
                </h2>
                <p style={{
                  margin: 0,
                  fontSize: 14,
                  color: "rgba(232,232,240,0.5)",
                  maxWidth: 380,
                  lineHeight: 1.6,
                }}>
                  Ask about customers, revenue, RTO, shipping — get real answers from your live data.
                </p>
              </div>

              {/* Suggested prompts grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                width: "100%",
                maxWidth: 640,
              }}>
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    className="suggested-btn"
                    onClick={() => send(prompt)}
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 12,
                      padding: "12px 16px",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 13,
                      color: "#e8e8f0",
                      lineHeight: 1.5,
                      transition: "all 0.2s ease",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message list */
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                    alignItems: "flex-end",
                    gap: 10,
                  }}
                >
                  {/* AI avatar for assistant/error messages */}
                  {m.role !== "user" && (
                    <div style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: m.role === "error"
                        ? "rgba(239,68,68,0.2)"
                        : "linear-gradient(135deg, #6c63ff, #a78bfa)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#fff",
                      flexShrink: 0,
                      letterSpacing: "0.3px",
                    }}>
                      {m.role === "error" ? "!" : "AI"}
                    </div>
                  )}

                  <div style={{
                    maxWidth: "75%",
                    background: m.role === "user"
                      ? "#6c63ff"
                      : m.role === "error"
                      ? "rgba(239,68,68,0.1)"
                      : "rgba(255,255,255,0.06)",
                    color: m.role === "user"
                      ? "#fff"
                      : m.role === "error"
                      ? "#f87171"
                      : "#e8e8f0",
                    borderRadius: m.role === "user"
                      ? "18px 18px 4px 18px"
                      : "18px 18px 18px 4px",
                    padding: "12px 16px",
                    fontSize: 14,
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    borderLeft: m.role === "assistant"
                      ? "2px solid rgba(108,99,255,0.5)"
                      : m.role === "error"
                      ? "2px solid rgba(239,68,68,0.5)"
                      : "none",
                    border: m.role === "error"
                      ? "1px solid rgba(239,68,68,0.2)"
                      : undefined,
                  }}>
                    {m.content}
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  alignItems: "flex-end",
                  gap: 10,
                }}>
                  <div style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #6c63ff, #a78bfa)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                    letterSpacing: "0.3px",
                  }}>
                    AI
                  </div>
                  <div style={{
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: "18px 18px 18px 4px",
                    borderLeft: "2px solid rgba(108,99,255,0.5)",
                    padding: "14px 20px",
                  }}>
                    <ThinkingDots />
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "14px 20px",
          display: "flex",
          gap: 12,
          background: "rgba(255,255,255,0.04)",
          alignItems: "flex-end",
        }}>
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about your store…"
            rows={1}
            disabled={isLoading}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: "11px 16px",
              fontSize: 14,
              fontFamily: "inherit",
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
              color: "#e8e8f0",
              lineHeight: 1.5,
              transition: "border-color 0.2s, box-shadow 0.2s",
              minHeight: 44,
              maxHeight: 120,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(108,99,255,0.6)"
              e.currentTarget.style.outline = "2px solid rgba(108,99,255,0.25)"
              e.currentTarget.style.outlineOffset = "0px"
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"
              e.currentTarget.style.outline = "none"
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <button
              className="send-btn"
              onClick={() => send(message)}
              disabled={isLoading || !message.trim()}
              style={{
                background: isLoading || !message.trim() ? "rgba(255,255,255,0.1)" : "#6c63ff",
                color: isLoading || !message.trim() ? "rgba(232,232,240,0.3)" : "#fff",
                border: "none",
                borderRadius: 10,
                padding: "11px 22px",
                cursor: isLoading || !message.trim() ? "not-allowed" : "pointer",
                fontSize: 14,
                fontWeight: 600,
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
                height: 44,
              }}
            >
              Send
            </button>
            <span style={{
              fontSize: 11,
              color: "rgba(232,232,240,0.3)",
              whiteSpace: "nowrap",
            }}>
              ↵ Enter to send
            </span>
          </div>
        </div>
      </div>

      {/* Clear conversation */}
      {messages.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            onClick={() => { setMessages([]); setHistory([]) }}
            style={{
              background: "none",
              border: "none",
              color: "rgba(239,68,68,0.6)",
              fontSize: 13,
              cursor: "pointer",
              padding: "4px 0",
              fontFamily: "inherit",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.9)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.6)" }}
          >
            Clear conversation
          </button>
        </div>
      )}
    </div>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", height: 20 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#6c63ff",
            animation: "pulse 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  )
}
