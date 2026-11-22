import React, { useState } from 'react';
import { Headphones, Send, X } from 'lucide-react';
import { SupportMessage } from '../types';

interface SupportChatDrawerProps {
  open: boolean;
  onClose: () => void;
  messages: SupportMessage[];
  activeOrderCode?: string;
  onSendMessage: (text: string, orderCode?: string) => Promise<void>;
}

const QUICK_INQUIRIES = [
  'Where is my rider right now?',
  'I need to update my delivery pin.',
  'Need help with Cash on Delivery / JazzCash.',
  'An item is missing from my order.',
];

export function SupportChatDrawer({
  open,
  onClose,
  messages,
  activeOrderCode,
  onSendMessage,
}: SupportChatDrawerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const handleSend = async (msgText: string) => {
    const trimmed = msgText.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await onSendMessage(trimmed, activeOrderCode);
      setText('');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(text);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-[#0C0C12] border-l border-amber-500/30 h-full flex flex-col shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/40 text-yellow-400 flex items-center justify-center">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">HSP delivery Support</h2>
              <p className="text-xs font-bold text-amber-400">
                Hasilpur & Pakistan Care · Avg reply &lt; 1 min
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-900 hover:text-amber-300"
            aria-label="Close support chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#08080C]">
          {messages.map((msg) => {
            const isCustomer = msg.senderRole === 'customer';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isCustomer
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 font-bold shadow-sm'
                      : 'bg-[#12121A] border border-zinc-800 text-zinc-100 font-semibold shadow-sm'
                  }`}
                >
                  <p
                    className={`text-[11px] font-extrabold mb-0.5 ${
                      isCustomer ? 'text-zinc-900/80' : 'text-amber-400'
                    }`}
                  >
                    {msg.senderName}
                    {msg.orderCode ? ` · ${msg.orderCode}` : ''}
                  </p>
                  <p>{msg.text}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Inquiry Buttons */}
        <div className="px-4 py-2.5 border-t border-zinc-800 bg-[#0C0C12] flex flex-wrap gap-1.5">
          {QUICK_INQUIRIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => handleSend(q)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-amber-500/15 border border-zinc-800 hover:border-amber-500/40 text-amber-300 text-xs font-bold transition-colors"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Message Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800 bg-[#0C0C12] flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your inquiry in English or Roman Urdu..."
            className="flex-1 px-3.5 py-2.5 text-sm font-semibold rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="min-w-[44px] min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 hover:brightness-105 disabled:opacity-40 flex items-center justify-center transition-all"
            aria-label="Send message"
          >
            <Send className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>
      </div>
    </div>
  );
}
