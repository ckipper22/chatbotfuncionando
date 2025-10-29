
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WhatsAppStorage } from '@/lib/whatsapp-storage';
import { MessageStats } from '@/types/whatsapp';
import { MessageCircle, Send, CheckCheck, Eye, XCircle } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState<MessageStats>({
    totalSent: 0,
    totalReceived: 0,
    delivered: 0,
    read: 0,
    failed: 0,
  });

  useEffect(() => {
    const loadStats = () => {
      const currentStats = WhatsAppStorage.getStats();
      setStats(currentStats);
    };

    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    {
      title: 'Mensagens Enviadas',
      value: stats.totalSent,
      icon: Send,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-950',
    },
    {
      title: 'Mensagens Recebidas',
      value: stats.totalReceived,
      icon: MessageCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-950',
    },
    {
      title: 'Entregues',
      value: stats.delivered,
      icon: CheckCheck,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-950',
    },
    {
      title: 'Lidas',
      value: stats.read,
      icon: Eye,
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-100 dark:bg-indigo-950',
    },
    {
      title: 'Falhas',
      value: stats.failed,
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-950',
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-muted-foreground">Estatísticas do seu bot do WhatsApp</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">{stat.title}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-3xl font-bold">{stat.value}</div>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
