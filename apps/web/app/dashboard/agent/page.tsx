'use client';

import React, { useState } from 'react';
import { 
  Bot, 
  Send, 
  Sparkles, 
  User,
  MoreVertical,
  ThumbsUp,
  ThumbsDown,
  RefreshCcw,
  Paperclip
} from 'lucide-react';
import { cn } from '@/components/ui/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hola, soy tu estratega digital. ¿En qué puedo ayudarte hoy con la campaña? He analizado los datos más recientes y tengo algunas sugerencias interesantes para la zona norte.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    
    const userMsg: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    
    // Simulate AI response
    setTimeout(() => {
      const aiMsg: Message = {
        role: 'assistant',
        content: 'Entendido. Estoy procesando esa información con los datos históricos de 2022 y las tendencias actuales. Dame un momento para generarte un reporte detallado.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-144px)] animate-in fade-in zoom-in-95 duration-500">
      {/* Chat Header */}
      <div className="bg-white p-6 rounded-t-[2.5rem] border border-zinc-100 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20">
            <Bot className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-secondary tracking-tight">Estratega Electoral IA</h1>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest italic">Activo y Analizando datos</span>
            </div>
          </div>
        </div>
        <button className="p-3 text-zinc-300 hover:text-secondary transition-colors">
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto bg-white/50 p-8 space-y-8 backdrop-blur-sm">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={cn(
              "flex items-start gap-4 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300",
              msg.role === 'user' ? "flex-row-reverse" : ""
            )}
          >
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm",
              msg.role === 'assistant' ? "bg-secondary text-white" : "bg-primary text-white"
            )}>
              {msg.role === 'assistant' ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />}
            </div>
            
            <div className={cn(
              "space-y-2 max-w-[80%]",
              msg.role === 'user' ? "items-end text-right" : ""
            )}>
              <div className={cn(
                "p-6 rounded-[2rem] text-sm font-medium leading-relaxed shadow-sm",
                msg.role === 'assistant' 
                  ? "bg-white text-secondary border border-zinc-100 rounded-tl-none" 
                  : "bg-primary text-white rounded-tr-none"
              )}>
                {msg.content}
              </div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-2">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 px-2">
                  <button className="p-1.5 text-zinc-300 hover:text-emerald-500 transition-colors"><ThumbsUp className="h-3 w-3" /></button>
                  <button className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors"><ThumbsDown className="h-3 w-3" /></button>
                  <button className="p-1.5 text-zinc-300 hover:text-primary transition-colors"><RefreshCcw className="h-3 w-3" /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Chat Input Area */}
      <div className="p-8 bg-white border-t border-zinc-100 rounded-b-[2.5rem] shadow-2xl">
        <div className="max-w-4xl mx-auto">
          <div className="relative group">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button className="p-2 text-zinc-300 hover:text-primary transition-colors">
                <Paperclip className="h-5 w-5" />
              </button>
            </div>
            
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Escribe tu pregunta estratégica aquí..."
              className="w-full h-16 pl-16 pr-20 rounded-[1.5rem] bg-zinc-50 border-none text-sm font-bold focus:ring-2 focus:ring-primary transition-all shadow-inner"
            />
            
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <button 
                onClick={handleSend}
                disabled={!input.trim()}
                className="h-10 w-10 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-all disabled:opacity-50 disabled:scale-95 shadow-lg shadow-primary/20"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
          
          <div className="mt-4 flex items-center justify-center gap-6">
             <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
               <Sparkles className="h-3 w-3 text-primary" />
               Analizando encuestas en vivo
             </div>
             <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
               <Sparkles className="h-3 w-3 text-primary" />
               Sincronizado con CNE
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
