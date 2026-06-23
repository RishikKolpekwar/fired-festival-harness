'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import {
  Plus, Lightbulb, Paperclip, Image, FileCode,
  ChevronDown, Check, Sparkles, Zap, Brain,
  SendHorizontal
} from 'lucide-react'
import { NeonText } from '@/components/ui/neon-text'
import { SparkleRow } from '@/components/ui/sparkle-row'

// TYPES
interface Model {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  badge?: string
}

// MODEL SELECTOR
const models: Model[] = [
  { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', description: 'Fast & intelligent', icon: <Zap className="size-4 text-blue-400" />, badge: 'Default' },
  { id: 'claude-opus-4-8', name: 'Opus 4.8', description: 'Most capable', icon: <Sparkles className="size-4 text-purple-400" />, badge: 'Pro' },
  { id: 'claude-haiku-4-5', name: 'Haiku 4.5', description: 'Lightning fast', icon: <Brain className="size-4 text-emerald-400" /> },
]

function ModelSelector({ selectedModel = 'claude-sonnet-4-6', onModelChange }: {
  selectedModel?: string
  onModelChange?: (model: Model) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState(models.find(m => m.id === selectedModel) || models[0])

  // Reflect the model the backend reports (via /api/health) when it changes.
  useEffect(() => {
    const match = models.find(m => m.id === selectedModel)
    if (match) setSelected(match)
  }, [selectedModel])

  const handleSelect = (model: Model) => {
    setSelected(model)
    setIsOpen(false)
    onModelChange?.(model)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-mono text-[11px] tracking-wide transition-all duration-200 text-[#8a8a8f] hover:text-white hover:bg-white/5 active:scale-95"
      >
        {selected.icon}
        <span>{selected.name}</span>
        <ChevronDown className={`size-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 z-50 min-w-[220px] bg-[#1a1a1e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="p-1.5">
              <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#5a5a5f]">
                Select Model
              </div>
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model)}
                  className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-all duration-150 ${
                    selected.id === model.id ? 'bg-white/10 text-white' : 'text-[#a0a0a5] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex-shrink-0">{model.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{model.name}</span>
                      {model.badge && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          model.badge === 'Pro' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'
                        }`}>
                          {model.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#6a6a6f]">{model.description}</span>
                  </div>
                  {selected.id === model.id && <Check className="size-4 text-blue-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// CHAT INPUT
export function ChatInput({
  onSend,
  placeholder = "What do you want to build?",
  disabled = false,
  selectedModel,
}: {
  onSend?: (message: string) => void
  placeholder?: string
  disabled?: boolean
  selectedModel?: string
}) {
  const [message, setMessage] = useState('')
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [message])

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSend?.(message)
      setMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="group relative mx-auto w-full max-w-[680px]">
      <div className="glass-strong relative rounded-2xl shadow-[0_8px_50px_rgba(0,0,0,0.55)] ring-1 ring-white/10 transition-all duration-300 focus-within:ring-white/20 focus-within:shadow-[0_10px_60px_rgba(20,136,252,0.16)]">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full resize-none bg-transparent px-5 pt-5 pb-3 text-[15px] text-white focus:outline-none min-h-[80px] max-h-[200px] disabled:opacity-60 placeholder:font-mono placeholder:text-[13px] placeholder:tracking-wide placeholder:text-[#6b7686]"
            style={{ height: '80px' }}
          />
        </div>

        <div className="flex items-center justify-between px-3 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className="flex items-center justify-center size-8 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-[#8a8a8f] hover:text-white transition-all duration-200 active:scale-95"
              >
                <Plus className={`size-4 transition-transform duration-200 ${showAttachMenu ? 'rotate-45' : ''}`} />
              </button>

              {showAttachMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                  <div className="absolute bottom-full left-0 mb-2 z-50 bg-[#1a1a1e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="p-1.5 min-w-[180px]">
                      {[
                        { icon: <Paperclip className="size-4" />, label: 'Upload file' },
                        { icon: <Image className="size-4" />, label: 'Add image' },
                        { icon: <FileCode className="size-4" />, label: 'Import code' }
                      ].map((item, i) => (
                        <button key={i} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[#a0a0a5] hover:bg-white/5 hover:text-white transition-all duration-150">
                          {item.icon}
                          <span className="text-sm">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <ModelSelector selectedModel={selectedModel} />
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 rounded-full px-3 py-2 font-mono text-[11px] tracking-wide text-[#6a6a6f] transition-all duration-200 hover:bg-white/5 hover:text-white">
              <Lightbulb className="size-4" />
              <span className="hidden sm:inline">plan</span>
            </button>

            <button
              onClick={handleSubmit}
              disabled={!message.trim() || disabled}
              className="group flex items-center gap-2 rounded-full bg-gradient-to-b from-[#3a9bff] to-[#1271f0] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_24px_-6px_rgba(20,136,252,0.65)] transition-all duration-200 hover:from-[#4aa6ff] hover:to-[#1a7bff] disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
            >
              <span className="hidden sm:inline">ask</span>
              <SendHorizontal className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// SUGGESTION CHIPS — tailored to Rishik's world (MedMorphIQ / pathology AI,
// VC + AI infra, KOL outreach)
const SUGGESTIONS = [
  "my morning brief",
  "ki-67 & er/pr pathology ai news",
  "paige, pathai & roche moves",
  "who should i follow up with",
]

function SuggestionChips({ onSend }: { onSend?: (message: string) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => onSend?.(s)}
          className="rounded-full border border-white/[0.07] bg-white/[0.03] px-3.5 py-1.5 font-mono text-[11px] tracking-wide text-[#9aa3b2] backdrop-blur-sm transition-all duration-200 hover:border-white/15 hover:text-white active:scale-95"
        >
          {s}
        </button>
      ))}
    </div>
  )
}

// MAIN BOLT CHAT COMPONENT (landing hero)
interface BoltChatProps {
  placeholder?: string
  selectedModel?: string
  disabled?: boolean
  onSend?: (message: string) => void
  /** Optional slot rendered just under the hero (e.g. the brief-ready banner). */
  slot?: React.ReactNode
}

function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "good morning";
  if (h < 18) return "good afternoon";
  return "good evening";
}

export function BoltStyleChat({
  placeholder = "ask your harness anything…",
  selectedModel,
  disabled,
  onSend,
  slot,
}: BoltChatProps) {
  const [greeting, setGreeting] = useState("good morning");
  useEffect(() => {
    setGreeting(greetingFor());
  }, []);
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden">
      <div className="absolute left-1/2 top-[64%] flex h-full w-full -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center overflow-hidden px-4 sm:top-1/2">
        <motion.div
          className="mb-8 flex flex-col items-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.05, ease: 'easeOut' }}
        >
          <span className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-[#7a8499]">
            {greeting}, rishik
          </span>
          <SparkleRow className="mb-2" count={5} fontSize="40px" />
          <NeonText
            text="s01o"
            className="h-[120px] w-[88vw] max-w-[640px] sm:h-[180px]"
          />
        </motion.div>

        <motion.div
          className="mb-6 mt-2 w-full max-w-[700px] sm:mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
        >
          <ChatInput placeholder={placeholder} onSend={onSend} disabled={disabled} selectedModel={selectedModel} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.28, ease: 'easeOut' }}
        >
          {slot ?? <SuggestionChips onSend={onSend} />}
        </motion.div>
      </div>
    </div>
  )
}
