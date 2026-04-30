/**
 * POST /api/otp — send or verify a 6-digit OTP via WhatsApp.
 *
 * Body: { phone: string, action: "send" | "verify", code?: string }
 *
 * MVP implementation: generates a random 6-digit code, stores it in-memory
 * with 5-minute TTL. In production, replace the in-memory store with Redis
 * and integrate WhatsApp BSP (Twilio/Gupshup) for actual message delivery.
 *
 * For now, the code is returned in the response (dev mode only) so the
 * onboarding flow can be tested without a real WhatsApp integration.
 */

import { NextResponse } from "next/server";

interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

// In-memory store — replace with Redis in production
const otpStore = new Map<string, OtpEntry>();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanExpired() {
  const now = Date.now();
  for (const [key, entry] of otpStore) {
    if (entry.expiresAt < now) otpStore.delete(key);
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { phone, action, code } = body as {
    phone?: string;
    action?: "send" | "verify";
    code?: string;
  };

  if (!phone || !action) {
    return NextResponse.json({ error: "phone e action são obrigatórios" }, { status: 400 });
  }

  const normalized = normalizePhone(phone);
  if (normalized.length < 10 || normalized.length > 13) {
    return NextResponse.json({ error: "Número de telefone inválido" }, { status: 400 });
  }

  cleanExpired();

  if (action === "send") {
    const otpCode = generateCode();
    otpStore.set(normalized, {
      code: otpCode,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
    });

    // TODO: Replace with actual WhatsApp BSP integration
    // await sendWhatsAppOtp(normalized, otpCode);

    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json({
      sent: true,
      // Only expose code in dev for testing
      ...(isDev ? { debug_code: otpCode } : {}),
    });
  }

  if (action === "verify") {
    if (!code) {
      return NextResponse.json({ error: "Código é obrigatório" }, { status: 400 });
    }

    const entry = otpStore.get(normalized);
    if (!entry) {
      return NextResponse.json({ error: "Código expirado ou não enviado" }, { status: 400 });
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
      otpStore.delete(normalized);
      return NextResponse.json(
        { error: "Muitas tentativas. Solicite um novo código." },
        { status: 429 },
      );
    }

    entry.attempts++;

    if (entry.code !== code) {
      return NextResponse.json({ error: "Código incorreto" }, { status: 400 });
    }

    // Success — clean up
    otpStore.delete(normalized);
    return NextResponse.json({ verified: true });
  }

  return NextResponse.json({ error: "action inválido" }, { status: 400 });
}
