// src/app/layout.tsx
// ====================================================================
// ARQUIVO COMPLETO E CORRIGIDO PARA SUPABASE AUTH
// ====================================================================

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import GlobalClientEffects from "@/components/GlobalClientEffects";
// 1. IMPORTAÇÃO DO NOVO PROVEDOR DE CLIENTE SUPABASE
import SupabaseClientProvider from '@/components/SupabaseClientProvider';

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WhatsApp Bot Backend - Sistema de Testes",
  description: "Sistema backend para integração com WhatsApp Business API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = (
    <>
      {children}
      <SonnerToaster />
      <GlobalClientEffects />
    </>
  );

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased `}
        // 2. Mantemos a correção de Hydration para o <body>
        suppressHydrationWarning={true}
      >
        {/* 3. ENVOLVEMOS TODA A APLICAÇÃO NO PROVEDOR DE SESSÃO */}
        <SupabaseClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {content}
          </ThemeProvider>
        </SupabaseClientProvider>
      </body>
    </html>
  );
}