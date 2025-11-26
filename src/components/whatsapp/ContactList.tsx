
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WhatsAppStorage } from '@/lib/whatsapp-storage';
import { WhatsAppContact } from '@/types/whatsapp';
import { RefreshCw, MessageCircle, User } from 'lucide-react';

export default function ContactList() {
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);

  const loadContacts = () => {
    const contactList = WhatsAppStorage.getContacts();
    setContacts(contactList);
  };

  useEffect(() => {
    loadContacts();
    const interval = setInterval(loadContacts, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Contatos</CardTitle>
            <CardDescription>Pessoas que interagiram com o bot</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadContacts}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {contacts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum contato ainda
            </div>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact) => (
                <div
                  key={contact.wa_id}
                  className="p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-full bg-primary/10">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">
                          {contact.profile?.name || contact.wa_id || contact.phoneNumber}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {contact.wa_id || contact.phoneNumber}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
