'use client';

import { useState } from 'react';
import { Sparkles, Send, X, Bot, Zap } from 'lucide-react';
import { Card, Button, Input } from '@/components/ui';

interface Message {
  role: string;
  text: string;
  actionable?: string;
}

export function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Hola, soy Gemini. Estoy analizando los datos de tu campaña Colombia 2026. ¿En qué puedo ayudarte hoy?' }
  ]);
  const [loading, setLoading] = useState(false);

  const TENANT_ID = 'cmlmfdxyt0000ccv1luccbi99';

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const userMsg = prompt;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setPrompt('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg, tenantId: TENANT_ID }),
      });
      const json = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', text: json.data.answer, actionable: json.data.actionable }]);
    } catch (_e) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error al conectar con mi cerebro cognitivo.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-50">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="h-16 w-16 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 transition-transform animate-bounce hover:animate-none"
        >
          <Sparkles className="h-8 w-8" />
        </button>
      ) : (
        <Card className="w-96 border-none shadow-2xl rounded-3xl overflow-hidden bg-white animate-in zoom-in-95 duration-200">
          <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-widest">Estratega IA</p>
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-tighter">Gemini-1.5-Pro Online</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-1 rounded-lg">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="h-96 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${
                  msg.role === 'user' 
                    ? 'bg-slate-900 text-white rounded-tr-none' 
                    : 'bg-white border border-slate-100 text-slate-700 shadow-sm rounded-tl-none'
                }`}>
                  <p className="font-medium leading-relaxed">{msg.text}</p>
                  {msg.actionable && (
                    <div className="mt-3 p-2 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-2">
                       <Zap className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                       <p className="text-[10px] font-black text-blue-700 uppercase leading-tight">{msg.actionable}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm rounded-tl-none">
                  <div className="flex gap-1">
                    <div className="h-1.5 w-1.5 bg-slate-300 rounded-full animate-bounce" />
                    <div className="h-1.5 w-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="h-1.5 w-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleChat} className="p-4 bg-white border-t border-slate-100 flex gap-2">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Pregúntame algo sobre la campaña..."
              className="rounded-xl border-slate-100 bg-slate-50 focus:bg-white transition-all text-xs"
            />
            <Button type="submit" size="icon" className="bg-slate-900 rounded-xl shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
