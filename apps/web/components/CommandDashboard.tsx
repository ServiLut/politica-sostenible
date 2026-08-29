'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const GOAL_DATA = [
  { name: 'S1', realidad: 1200, meta: 1000 },
  { name: 'S2', realidad: 2500, meta: 3000 },
  { name: 'S3', realidad: 4800, meta: 5000 },
  { name: 'S4', realidad: 7200, meta: 8000 },
];

const ISSUE_DATA = [
  { name: 'Seguridad', value: 450, color: '#ef4444' },
  { name: 'Salud', value: 320, color: '#3b82f6' },
  { name: 'Empleo', value: 280, color: '#10b981' },
  { name: 'Educación', value: 150, color: '#f59e0b' },
];

export const CommandDashboard = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-gray-50/50 border-b">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-500">
            Crecimiento de Firmas (Avance Meta)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={GOAL_DATA}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="realidad" 
                  stroke="#2563eb" 
                  strokeWidth={4} 
                  dot={{ r: 6, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} 
                  activeDot={{ r: 8 }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="meta" 
                  stroke="#cbd5e1" 
                  strokeDasharray="5 5" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-gray-50/50 border-b">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-500">
            Preocupaciones Ciudadanas
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ISSUE_DATA} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#475569', fontSize: 12, fontWeight: 500 }}
                  width={80}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {ISSUE_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
